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
  getDocs
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useAuth } from "../context/AuthContext";
import { v4 as uuidv4 } from "uuid";

const Chat = () => {
  const { userId } = useParams();
  const { currentUser } = useAuth();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const bottomRef = useRef(null);

  // Generate a unique chat ID based on user IDs (sorted to ensure consistency)
  const chatId = currentUser.uid > userId 
    ? `${currentUser.uid}-${userId}` 
    : `${userId}-${currentUser.uid}`;

  useEffect(() => {
    // Listener for messages
    const q = query(
      collection(db, "chats", chatId, "messages"),
      orderBy("createdAt", "asc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = [];
      snapshot.forEach((doc) => {
        msgs.push({ id: doc.id, ...doc.data() });
      });
      setMessages(msgs);
      
      // Mark unseen messages as seen immediately upon loading or receiving
      // This is part of the "seen" logic
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

    return () => unsubscribe();
  }, [chatId, currentUser.uid]);

  // Handle "Disappearing Messages" on unmount / navigate back
  useEffect(() => {
     // The requirement: "message seen hone ke baad back aane pe message apne aap MIT jaye"
     // This means when we leave the chat, if we have seen messages, they should disappear.
     // Since we marked them as 'seen' above, we can now delete them or mark them as hidden for the viewer.
     // Deleting them from the database means they are gone for both. 
     // Snapchat deletes after view. So we will delete the message if I am the recipient and I have seen it.
     
     return () => {
         const deleteSeenMessages = async () => {
             try {
                // Query for messages sent to me that are seen
                const qSeen = query(
                    collection(db, "chats", chatId, "messages"),
                    where("senderId", "==", userId), // Message from the other person
                    where("seen", "==", true)
                );
                
                const snapshot = await getDocs(qSeen);
                const deletionPromises = [];
                snapshot.forEach((d) => {
                    // Delete the message document
                    deletionPromises.push(deleteDoc(d.ref));
                });
                await Promise.all(deletionPromises);
             } catch (error) {
                 console.error("Error deleting seen messages:", error);
             }
         };
         deleteSeenMessages();
     }
  }, [chatId, userId]); 
  // NOTE: Cleanup function in useEffect runs when component unmounts.
  // However, I need `getDocs` imported. I missed importing it.
  
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!text && !file) return;

    setLoading(true);

    try {
      let url = null;
      let type = "text";

      if (file) {
        const fileRef = ref(storage, `chat/${chatId}/${uuidv4()}`);
        await uploadBytes(fileRef, file);
        url = await getDownloadURL(fileRef);
        type = file.type.startsWith("image/") ? "image" : "video";
      }

      await addDoc(collection(db, "chats", chatId, "messages"), {
        text,
        senderId: currentUser.uid,
        createdAt: Timestamp.now(),
        seen: false,
        ...(url && { url, type }),
      });

      setText("");
      setFile(null);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };
  
  const handleFileChange = (e) => {
      if (e.target.files[0]) {
          setFile(e.target.files[0]);
      }
  }

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      <header className="bg-blue-600 p-4 text-white flex items-center shadow-md">
        <button onClick={() => navigate(-1)} className="mr-4 font-bold text-xl">
           &larr;
        </button>
        <h1 className="text-lg font-bold">Chat</h1>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => {
            const isMe = msg.senderId === currentUser.uid;
            return (
                <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-xs md:max-w-md p-3 rounded-lg ${isMe ? "bg-blue-500 text-white" : "bg-white text-gray-800"}`}>
                        {msg.type === "image" && (
                            <img src={msg.url} alt="Shared" className="rounded mb-2 max-h-64 object-cover" />
                        )}
                        {msg.type === "video" && (
                            <video src={msg.url} controls className="rounded mb-2 max-h-64" />
                        )}
                        {msg.text && <p>{msg.text}</p>}
                        
                        <div className={`text-xs mt-1 text-right ${isMe ? "text-blue-200" : "text-gray-400"}`}>
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
            );
        })}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSend} className="p-4 bg-white border-t flex items-center gap-2">
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
         <button type="submit" disabled={loading} className="bg-blue-600 text-white p-2 rounded-full hover:bg-blue-700 disabled:opacity-50">
             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
               <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
             </svg>
         </button>
      </form>
    </div>
  );
};

export default Chat;
