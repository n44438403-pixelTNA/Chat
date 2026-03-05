import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { db, storage, rtdb } from "../firebase";
import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  Timestamp,
  updateDoc,
  doc,
  deleteDoc,
  setDoc,
  getDoc
} from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { ref as rtdbRef, onValue, set, onDisconnect } from "firebase/database";
import { useAuth } from "../context/AuthContext";
import { v4 as uuidv4 } from "uuid";

const Chat = () => {
  const { userId } = useParams();
  const { currentUser, isAdmin } = useAuth();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [wallpaperUrl, setWallpaperUrl] = useState("");
  const [otherUser, setOtherUser] = useState(null);
  const [presence, setPresence] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [deleteModal, setDeleteModal] = useState(null); // stores the msg object to be deleted
  const [otherUserTyping, setOtherUserTyping] = useState(null);
  const [draftMessages, setDraftMessages] = useState([]);
  const [globalSettings, setGlobalSettings] = useState({ autoDeleteHours: 24, allowManualDelete: true });
  const navigate = useNavigate();
  const bottomRef = useRef(null);

  // Generate a unique chat ID based on user IDs (sorted to ensure consistency)
  const chatId = currentUser.uid > userId 
    ? `${currentUser.uid}-${userId}` 
    : `${userId}-${currentUser.uid}`;

  useEffect(() => {
    const fetchOtherUser = async () => {
      const userDocRef = doc(db, "users", userId);
      const userDoc = await getDoc(userDocRef);
      if (userDoc.exists()) {
        setOtherUser(userDoc.data());
      }
    };
    fetchOtherUser();

    // Listen to other user's presence
    const userStatusRef = rtdbRef(rtdb, `/status/${userId}`);
    const unsubscribePresence = onValue(userStatusRef, (snapshot) => {
      if (snapshot.exists()) {
        setPresence(snapshot.val());
      }
    });

    // Listen to other user's typing status
    const otherUserTypingRef = rtdbRef(rtdb, `/typing/${chatId}/${userId}`);
    const unsubscribeTyping = onValue(otherUserTypingRef, (snapshot) => {
      if (snapshot.exists()) {
        setOtherUserTyping(snapshot.val());
      } else {
        setOtherUserTyping(null);
      }
    });

    // Cleanup my own typing status on disconnect
    const myTypingRef = rtdbRef(rtdb, `/typing/${chatId}/${currentUser.uid}`);
    onDisconnect(myTypingRef).set(null);

    // Fetch global settings
    const fetchSettings = async () => {
        const settingsDoc = await getDoc(doc(db, "settings", "global"));
        if (settingsDoc.exists()) {
            setGlobalSettings({
                autoDeleteHours: settingsDoc.data().autoDeleteHours || 24,
                allowManualDelete: settingsDoc.data().allowManualDelete !== undefined ? settingsDoc.data().allowManualDelete : true
            });
        }
    };
    fetchSettings();

    // Fetch chat wallpaper
    const fetchChatMetadata = async () => {
        const chatDocRef = doc(db, "chats", chatId);
        const chatDoc = await getDoc(chatDocRef);
        if (chatDoc.exists() && chatDoc.data().wallpaperUrl) {
            setWallpaperUrl(chatDoc.data().wallpaperUrl);
        }
    };
    fetchChatMetadata();

    // Listen for changes to chat metadata (wallpaper)
    const unsubscribeChat = onSnapshot(doc(db, "chats", chatId), (doc) => {
        if (doc.exists() && doc.data().wallpaperUrl) {
            setWallpaperUrl(doc.data().wallpaperUrl);
        }
    });

    // Listener for messages
    const q = query(
      collection(db, "chats", chatId, "messages"),
      orderBy("createdAt", "asc")
    );

    const unsubscribeMsgs = onSnapshot(q, (snapshot) => {
      const msgs = [];
      const now = Date.now();
      const autoDeleteMs = globalSettings.autoDeleteHours * 60 * 60 * 1000;

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const msgTime = data.createdAt ? data.createdAt.toMillis() : now;

        // Skip if message was deleted for me
        if (data.deletedFor && data.deletedFor.includes(currentUser.uid)) {
          return;
        }

        // Check if message is older than auto-delete setting
        if (now - msgTime > autoDeleteMs && !data.saved) {
            // Delete message if older than config and not saved
            try {
                deleteDoc(doc(db, "chats", chatId, "messages", docSnap.id));
            } catch (e) {
                console.error("Error auto-deleting old message:", e);
            }
        } else {
            msgs.push({ id: docSnap.id, ...data });
        }
      });

      setMessages(msgs);
      
      // Mark unseen messages as seen immediately upon loading or receiving
      msgs.forEach(async (msg) => {
          if (msg.senderId !== currentUser.uid && !msg.seen) {
             try {
                const msgRef = doc(db, "chats", chatId, "messages", msg.id);
                await updateDoc(msgRef, {
                  seen: true,
                  seenAt: Timestamp.now()
                });
             } catch (e) {
                 console.error("Error marking seen:", e);
             }
          }
      });
    });

    return () => {
        unsubscribeChat();
        unsubscribeMsgs();
        unsubscribePresence();
        unsubscribeTyping();
        set(myTypingRef, null); // Clear on unmount
    };
  }, [chatId, currentUser.uid, userId, globalSettings.autoDeleteHours]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleTextChange = (e) => {
    const newText = e.target.value;

    // Check if user is significantly deleting/clearing text
    if (text.length > 0 && newText.length < text.length - 2) {
       // Only save draft if it was substantial
       if (text.trim().length > 1) {
           setDraftMessages(prev => [...prev, text.trim()]);
       }
    }

    setText(newText);

    // Update typing status in RTDB
    const myTypingRef = rtdbRef(rtdb, `/typing/${chatId}/${currentUser.uid}`);
    if (newText.trim() === "") {
        set(myTypingRef, null);
    } else {
        set(myTypingRef, {
            isTyping: true,
            text: newText
        });
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!text) return;

    setLoading(true);

    try {
      // First, send any collected draft messages
      for (const draft of draftMessages) {
          await sendMessage(draft, true);
      }
      setDraftMessages([]); // clear drafts

      // Then send the actual message
      await sendMessage(text, false);
      setText("");
      set(rtdbRef(rtdb, `/typing/${chatId}/${currentUser.uid}`), null);
      setLoading(false);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  const sendMessage = async (msgText, isDraft = false) => {
      const payload = {
        text: msgText,
        senderId: currentUser.uid,
        createdAt: Timestamp.now(),
        seen: false,
        saved: false,
      };

      if (isDraft) {
          payload.isDraft = true;
      }

      if (replyingTo && !isDraft) {
        payload.replyToId = replyingTo.id;
        payload.replyToText = replyingTo.text;
        payload.replyToSenderId = replyingTo.senderId;
      }

      await addDoc(collection(db, "chats", chatId, "messages"), payload);
      if (!isDraft) {
          setReplyingTo(null);
      }
  };

  const handleWallpaperChange = async (e) => {
      const wallpaperFile = e.target.files[0];
      if (!wallpaperFile) return;

      try {
          const fileRef = ref(storage, `chat/${chatId}/wallpaper_${uuidv4()}`);
          await uploadBytesResumable(fileRef, wallpaperFile);
          const url = await getDownloadURL(fileRef);
          
          await setDoc(doc(db, "chats", chatId), { wallpaperUrl: url }, { merge: true });
      } catch (err) {
          console.error("Error setting wallpaper:", err);
      }
  };

  const toggleSave = async (msgId, currentStatus) => {
      const msgRef = doc(db, "chats", chatId, "messages", msgId);
      await updateDoc(msgRef, { saved: !currentStatus });
  };

  const handleDeleteForMe = async () => {
    if (!deleteModal) return;
    const msgRef = doc(db, "chats", chatId, "messages", deleteModal.id);
    const msgData = deleteModal;

    // Add currentUser.uid to deletedFor array
    const updatedDeletedFor = msgData.deletedFor ? [...msgData.deletedFor, currentUser.uid] : [currentUser.uid];

    try {
      await updateDoc(msgRef, { deletedFor: updatedDeletedFor });
    } catch (err) {
      console.error("Error deleting for me:", err);
    }
    setDeleteModal(null);
  };

  const handleDeleteForEveryone = async () => {
    if (!deleteModal) return;
    const msgRef = doc(db, "chats", chatId, "messages", deleteModal.id);
    try {
      await deleteDoc(msgRef);
    } catch (err) {
      console.error("Error deleting for everyone:", err);
    }
    setDeleteModal(null);
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100 relative">
      {/* Background Wallpaper Layer */}
      {wallpaperUrl && (
          <div 
            className="absolute inset-0 z-0 opacity-40 bg-cover bg-center pointer-events-none"
            style={{ backgroundImage: `url(${wallpaperUrl})` }}
          />
      )}

      <header className="bg-blue-600 p-4 text-white flex items-center justify-between shadow-md z-10 relative">
        <div className="flex items-center">
            <button onClick={() => navigate(-1)} className="mr-4 font-bold text-xl">
            &larr;
            </button>
            <div className="flex flex-col">
              <h1 className="text-lg font-bold">
                {otherUser ? otherUser.displayName || otherUser.email : "Chat"}
              </h1>
              {presence && (
                <span className="text-xs text-blue-200">
                  {presence.state === "online"
                    ? "Online"
                    : `Last seen: ${presence.last_changed ? new Date(presence.last_changed).toLocaleString() : "offline"}`}
                </span>
              )}
            </div>
        </div>
        <div className="relative overflow-hidden">
             <label className="cursor-pointer text-xs bg-blue-700 hover:bg-blue-800 px-3 py-1 rounded flex items-center">
                 <span>Set Wallpaper</span>
                 <input type="file" className="hidden" onChange={handleWallpaperChange} accept="image/*" />
             </label>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 z-10 relative">
        {messages.map((msg) => {
            const isMe = msg.senderId === currentUser.uid;

            // If the message is a draft message
            if (msg.isDraft) {
                // Sender never sees their own draft message bubbles, ONLY the admin sees them
                if (isMe) return null;
                // Non-admins don't see other people's draft messages
                if (!isAdmin) return null;

                return (
                    <div key={msg.id} className="flex justify-start group mb-2 opacity-70">
                        <div className="max-w-xs md:max-w-md p-3 rounded-lg relative bg-yellow-100 border border-yellow-300 text-gray-800 shadow-sm">
                            <span className="text-[10px] font-bold text-yellow-600 block mb-1">DRAFT MESSAGE</span>
                            {msg.text && <p className="italic">{msg.text}</p>}
                            <div className="text-[10px] mt-1 flex justify-end gap-2 items-center text-gray-400">
                                <span>{msg.createdAt && new Date(msg.createdAt.toMillis()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                            </div>
                        </div>
                    </div>
                );
            }

            return (
                <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"} group mb-2`}>
                    <div className={`max-w-xs md:max-w-md p-3 rounded-lg relative ${isMe ? "bg-blue-500 text-white" : "bg-white text-gray-800 shadow"}`}>
                        {msg.replyToText && (
                            <div className={`mb-2 p-2 rounded text-xs ${isMe ? "bg-blue-600 text-blue-100" : "bg-gray-100 text-gray-600"} border-l-4 ${isMe ? "border-blue-300" : "border-blue-500"}`}>
                                <p className="font-semibold">{msg.replyToSenderId === currentUser.uid ? "You" : (otherUser ? otherUser.displayName || "User" : "User")}</p>
                                <p className="truncate">{msg.replyToText}</p>
                            </div>
                        )}
                        {msg.text && <p>{msg.text}</p>}
                        
                        <div className="flex items-center justify-end mt-1 gap-2">
                             {/* Reply Button */}
                             <button
                                onClick={() => setReplyingTo(msg)}
                                className={`text-xs ${isMe ? "text-blue-200 hover:text-white" : "text-gray-400 hover:text-gray-600"} opacity-0 group-hover:opacity-100 transition-opacity`}
                                title="Reply"
                             >
                                 Reply
                             </button>

                             {/* Save Button */}
                             <button 
                                onClick={() => toggleSave(msg.id, msg.saved)}
                                className={`text-xs ${msg.saved ? "text-yellow-400 font-bold" : "text-gray-400 hover:text-yellow-300"}`}
                                title={msg.saved ? "Unsave" : "Save to prevent deletion"}
                             >
                                 {msg.saved ? "★ Saved" : "☆"}
                             </button>

                             {/* Delete Button */}
                             {(globalSettings.allowManualDelete || isAdmin) && (
                                 <button
                                    onClick={() => setDeleteModal(msg)}
                                    className={`text-xs ${isMe ? "text-red-300 hover:text-red-100" : "text-gray-400 hover:text-red-400"} opacity-0 group-hover:opacity-100 transition-opacity`}
                                    title="Delete"
                                 >
                                     🗑
                                 </button>
                             )}

                        </div>

                        <div className={`text-[10px] mt-1 flex justify-end gap-2 items-center ${isMe ? "text-blue-200" : "text-gray-400"}`}>
                            <span>
                                {msg.createdAt && new Date(msg.createdAt.toMillis()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                            </span>
                            {isMe && (
                                <span className="flex items-center gap-1">
                                    {msg.seen ? (
                                        <span className="text-green-300 font-bold" title={msg.seenAt ? `Seen at ${new Date(msg.seenAt.toMillis()).toLocaleTimeString()}` : "Seen"}>
                                            ✓✓ {msg.seenAt && <span className="text-[9px] font-normal">({new Date(msg.seenAt.toMillis()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})})</span>}
                                        </span>
                                    ) : (
                                        <span title="Delivered">✓</span>
                                    )}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            );
        })}

        {/* Live Typing Indicator */}
        {otherUserTyping && otherUserTyping.isTyping && (
          <div className="flex justify-start group mb-2">
            <div className="max-w-xs md:max-w-md p-3 rounded-lg relative bg-white text-gray-800 shadow italic">
              <span className="text-xs text-gray-500 font-semibold block mb-1">
                {otherUser ? otherUser.displayName || otherUser.email : "User"} is typing...
              </span>
              {/* If other user is NOT an admin, show exact text */}
              {(!otherUser || !otherUser.isAdmin) && otherUserTyping.text && (
                 <p className="text-gray-700">{otherUserTyping.text}</p>
              )}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {replyingTo && (
        <div className="bg-gray-200 p-2 flex items-center justify-between text-sm z-10 relative">
            <div className="truncate flex-1 pr-4 border-l-4 border-blue-500 pl-2">
                <span className="font-semibold text-blue-600 text-xs block">Replying to {replyingTo.senderId === currentUser.uid ? "yourself" : (otherUser ? otherUser.displayName || "user" : "user")}</span>
                <span className="text-gray-600 text-xs">{replyingTo.text}</span>
            </div>
            <button onClick={() => setReplyingTo(null)} className="text-gray-500 hover:text-gray-800 font-bold p-1">✕</button>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 w-80 shadow-xl flex flex-col items-center">
            <h3 className="text-lg font-bold mb-4">Delete Message?</h3>
            <div className="flex flex-col gap-2 w-full">
              <button
                onClick={handleDeleteForMe}
                className="w-full bg-gray-200 hover:bg-gray-300 text-gray-800 py-2 rounded font-semibold transition-colors"
              >
                Delete for me
              </button>
              {deleteModal.senderId === currentUser.uid && (
                <button
                  onClick={handleDeleteForEveryone}
                  className="w-full bg-red-500 hover:bg-red-600 text-white py-2 rounded font-semibold transition-colors"
                >
                  Delete for everyone
                </button>
              )}
              <button
                onClick={() => setDeleteModal(null)}
                className="w-full mt-2 text-gray-500 hover:text-gray-800 py-2 rounded font-semibold transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSend} className="p-4 bg-white border-t flex items-center gap-2 z-10 relative">
         <input 
            type="text" 
            value={text} 
            onChange={handleTextChange}
            placeholder="Type a message..."
            className="flex-1 border rounded-full px-4 py-2 focus:outline-none focus:ring-1 focus:ring-blue-600"
         />
         <button type="submit" disabled={loading || !text} className="bg-blue-600 text-white p-2 rounded-full hover:bg-blue-700 disabled:opacity-50 min-w-[40px] flex justify-center">
            {loading ? (
                <span className="text-xs font-bold">...</span>
            ) : (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                </svg>
            )}
         </button>
      </form>
    </div>
  );
};

export default Chat;
