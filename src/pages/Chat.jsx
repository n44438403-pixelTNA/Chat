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
import { ref as rtdbRef, onValue } from "firebase/database";
import { useAuth } from "../context/AuthContext";
import { v4 as uuidv4 } from "uuid";

const Chat = () => {
  const { userId } = useParams();
  const { currentUser } = useAuth();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [wallpaperUrl, setWallpaperUrl] = useState("");
  const [otherUser, setOtherUser] = useState(null);
  const [presence, setPresence] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
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
      const twentyFourHours = 24 * 60 * 60 * 1000;

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const msgTime = data.createdAt ? data.createdAt.toMillis() : now;

        // Check if message is older than 24 hours
        if (now - msgTime > twentyFourHours && !data.saved) {
            // Delete message if older than 24h and not saved
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
    };
  }, [chatId, currentUser.uid, userId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!text) return;

    setLoading(true);

    try {
      await sendMessage(text);
      setText("");
      setLoading(false);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  const sendMessage = async (msgText) => {
      const payload = {
        text: msgText,
        senderId: currentUser.uid,
        createdAt: Timestamp.now(),
        seen: false,
        saved: false,
      };

      if (replyingTo) {
        payload.replyToId = replyingTo.id;
        payload.replyToText = replyingTo.text;
        payload.replyToSenderId = replyingTo.senderId;
      }

      await addDoc(collection(db, "chats", chatId, "messages"), payload);
      setReplyingTo(null);
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

  const deleteMessage = async (msgId) => {
      const msgRef = doc(db, "chats", chatId, "messages", msgId);
      await deleteDoc(msgRef);
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

                             {/* Delete Button (Sender only) */}
                             {isMe && (
                                 <button 
                                    onClick={() => deleteMessage(msg.id)}
                                    className="text-xs text-red-300 hover:text-red-100"
                                    title="Delete for everyone"
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

      <form onSubmit={handleSend} className="p-4 bg-white border-t flex items-center gap-2 z-10 relative">
         <input 
            type="text" 
            value={text} 
            onChange={e => setText(e.target.value)}
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
