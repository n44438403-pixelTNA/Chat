import React, { useEffect, useState } from "react";
import { db, rtdb } from "../firebase";
import { collection, getDocs, query, where } from "firebase/firestore";
import { ref as rtdbRef, onValue } from "firebase/database";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const UserListItem = ({ user }) => {
  const [presence, setPresence] = useState(null);

  useEffect(() => {
    const userStatusRef = rtdbRef(rtdb, `/status/${user.uid}`);
    const unsubscribePresence = onValue(userStatusRef, (snapshot) => {
      if (snapshot.exists()) {
        setPresence(snapshot.val());
      }
    });

    return () => {
      unsubscribePresence();
    };
  }, [user.uid]);

  return (
    <li className="border-b last:border-b-0">
      <Link to={`/chat/${user.uid}`} className="block hover:bg-gray-50 p-4 flex items-center">
        <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center text-gray-600 font-bold mr-3 relative">
          {user.displayName ? user.displayName.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase()}
          {presence && presence.state === "online" && (
            <span className="absolute bottom-0 right-0 block h-3 w-3 rounded-full bg-green-500 ring-2 ring-white" />
          )}
        </div>
        <div>
          <p className="font-semibold text-gray-800">{user.displayName || user.email}</p>
          <p className="text-sm text-gray-500">
            {presence && presence.state === "online"
              ? "Online"
              : presence && presence.last_changed
              ? `Last seen: ${new Date(presence.last_changed).toLocaleString()}`
              : "Tap to chat"}
          </p>
        </div>
      </Link>
    </li>
  );
};

const Home = () => {
  const [users, setUsers] = useState([]);
  const { currentUser, logout } = useAuth();

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const q = query(collection(db, "users"), where("uid", "!=", currentUser.uid));
        const querySnapshot = await getDocs(q);
        const userList = [];
        querySnapshot.forEach((doc) => {
          userList.push(doc.data());
        });
        setUsers(userList);
      } catch (error) {
        console.error("Error fetching users: ", error);
      }
    };

    if (currentUser) {
      fetchUsers();
    }
  }, [currentUser]);

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-blue-600 p-4 text-white flex justify-between items-center shadow-md">
        <h1 className="text-xl font-bold">Chats</h1>
        <button onClick={logout} className="bg-red-500 px-4 py-2 rounded text-sm hover:bg-red-600">Logout</button>
      </header>
      <main className="p-4">
        <div className="bg-white rounded-lg shadow overflow-hidden max-w-2xl mx-auto">
          {users.length === 0 ? (
            <p className="p-4 text-center text-gray-500">No other users found.</p>
          ) : (
            <ul>
              {users.map((user) => (
                <UserListItem key={user.uid} user={user} />
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
};

export default Home;
