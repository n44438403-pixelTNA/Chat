import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { db, storage } from "../firebase";
import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  Timestamp,
  updateDoc,
  doc,
  where,
  deleteDoc,
  getDocs,
  setDoc,
  getDoc
} from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { useAuth } from "../context/AuthContext";
import { v4 as uuidv4 } from "uuid";

const Chat = () => {
  const { userId } = useParams();
  const { currentUser } = useAuth();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [wallpaperUrl, setWallpaperUrl] = useState("");
  const navigate = useNavigate();
  const bottomRef = useRef(null);

  // Generate a unique chat ID based on user IDs (sorted to ensure consistency)
  const chatId = currentUser.uid > userId 
    ? `${currentUser.uid}-${userId}` 
    : `${userId}-${currentUser.uid}`;

  useEffect(() => {
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
      snapshot.forEach((doc) => {
        msgs.push({ id: doc.id, ...doc.data() });
      });
      setMessages(msgs);
      
      // Mark unseen messages as seen immediately upon loading or receiving
      msgs.forEach(async (msg) => {
          if (msg.senderId !== currentUser.uid && !msg.seen) {
             try {
                const msgRef = doc(db, "chats", chatId, "messages", msg.id);
                await updateDoc(msgRef, { seen: true });
             } catch (e) {
                 console.error("Error marking seen:", e);
             }
          }
      });
    });

    return () => {
        unsubscribeChat();
        unsubscribeMsgs();
    };
  }, [chatId, currentUser.uid]);

  // Handle "Disappearing Messages" on unmount / navigate back
  useEffect(() => {
     return () => {
         const deleteSeenMessages = async () => {
             try {
                // Query for messages sent to me that are seen AND NOT SAVED
                // We will fetch seen messages and client-side filter for 'saved' status
                const qSeen = query(
                    collection(db, "chats", chatId, "messages"),
                    where("senderId", "==", userId), // Message from the other person
                    where("seen", "==", true)
                );
                
                const snapshot = await getDocs(qSeen);
                const deletionPromises = [];
                snapshot.forEach((d) => {
                    const data = d.data();
                    if (!data.saved) {
                        deletionPromises.push(deleteDoc(d.ref));
                    }
                });
                await Promise.all(deletionPromises);
             } catch (error) {
                 console.error("Error deleting seen messages:", error);
             }
         };
         deleteSeenMessages();
     }
  }, [chatId, userId]); 
  
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!text && !file) return;

    setLoading(true);
    setUploadProgress(0);

    try {
      let url = null;
      let type = "text";

      if (file) {
        const fileRef = ref(storage, `chat/${chatId}/${uuidv4()}`);
        const uploadTask = uploadBytesResumable(fileRef, file);

        uploadTask.on('state_changed', 
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            setUploadProgress(progress);
          }, 
          (error) => {
             console.error("Upload failed", error);
             setLoading(false);
          }, 
          async () => {
            url = await getDownloadURL(uploadTask.snapshot.ref);
            type = file.type.startsWith("image/") ? "image" : "video";
            
            await sendMessage(text, url, type);
            setLoading(false);
            setUploadProgress(0);
            setText("");
            setFile(null);
          }
        );
        return; // Return here as async task continues in callback
      } else {
          await sendMessage(text, null, "text");
          setText("");
          setLoading(false);
      }
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  const sendMessage = async (msgText, mediaUrl, msgType) => {
      await addDoc(collection(db, "chats", chatId, "messages"), {
        text: msgText,
        senderId: currentUser.uid,
        createdAt: Timestamp.now(),
        seen: false,
        saved: false,
        ...(mediaUrl && { url: mediaUrl, type: msgType }),
      });
  };
  
  const handleFileChange = (e) => {
      if (e.target.files[0]) {
          setFile(e.target.files[0]);
      }
  }

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
            <h1 className="text-lg font-bold">Chat</h1>
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
                <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"} group`}>
                    <div className={`max-w-xs md:max-w-md p-3 rounded-lg relative ${isMe ? "bg-blue-500 text-white" : "bg-white text-gray-800"}`}>
                        {msg.type === "image" && (
                            <img src={msg.url} alt="Shared" className="rounded mb-2 max-h-64 object-cover" />
                        )}
                        {msg.type === "video" && (
                            <video src={msg.url} controls className="rounded mb-2 max-h-64" />
                        )}
                        {msg.text && <p>{msg.text}</p>}
                        
                        <div className="flex items-center justify-end mt-1 gap-2">
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

                            <div className={`text-xs ${isMe ? "text-blue-200" : "text-gray-400"}`}>
                                {isMe && (
                                    <span>
                                        {msg.seen ? (
                                            <span className="text-green-300 font-bold">✓✓</span>
                                        ) : (
                                            <span>✓</span>
                                        )}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            );
        })}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSend} className="p-4 bg-white border-t flex items-center gap-2 z-10 relative">
         <label className="cursor-pointer text-gray-500 hover:text-blue-600">
             <input type="file" className="hidden" onChange={handleFileChange} accept="image/*,video/*" />
             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" />
             </svg>
         </label>
         {file && (
             <div className="text-xs bg-gray-200 px-2 py-1 rounded flex items-center">
                 {file.name.substring(0, 10)}...
                 <button type="button" onClick={() => setFile(null)} className="ml-1 text-red-500 font-bold">x</button>
             </div>
         )}
         <input 
            type="text" 
            value={text} 
            onChange={e => setText(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 border rounded-full px-4 py-2 focus:outline-none focus:ring-1 focus:ring-blue-600"
         />
         <button type="submit" disabled={loading} className="bg-blue-600 text-white p-2 rounded-full hover:bg-blue-700 disabled:opacity-50 min-w-[40px] flex justify-center">
             {loading && uploadProgress > 0 ? (
                 <span className="text-xs font-bold">{Math.round(uploadProgress)}%</span>
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
