import React, { useEffect, useState } from "react";
import { db } from "../firebase";
import { doc, getDoc, setDoc, updateDoc, collection, getDocs } from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

const Settings = () => {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();

  const [autoDeleteHours, setAutoDeleteHours] = useState(24);
  const [allowManualDelete, setAllowManualDelete] = useState(true);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAdmin) {
      navigate("/");
      return;
    }

    const fetchSettings = async () => {
      try {
        const settingsDoc = await getDoc(doc(db, "settings", "global"));
        if (settingsDoc.exists()) {
          const data = settingsDoc.data();
          setAutoDeleteHours(data.autoDeleteHours || 24);
          if (data.allowManualDelete !== undefined) {
            setAllowManualDelete(data.allowManualDelete);
          }
        } else {
          // Initialize settings if they don't exist
          await setDoc(doc(db, "settings", "global"), {
            autoDeleteHours: 24,
            allowManualDelete: true
          });
        }
      } catch (err) {
        console.error("Error fetching settings:", err);
      }
    };

    const fetchUsers = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, "users"));
        const userList = [];
        querySnapshot.forEach((doc) => {
          userList.push({ id: doc.id, ...doc.data() });
        });
        setUsers(userList);
      } catch (err) {
        console.error("Error fetching users:", err);
      }
    };

    Promise.all([fetchSettings(), fetchUsers()]).then(() => setLoading(false));
  }, [isAdmin, navigate]);

  const handleSaveSettings = async () => {
    setLoading(true);
    try {
      await updateDoc(doc(db, "settings", "global"), {
        autoDeleteHours: Number(autoDeleteHours),
        allowManualDelete
      });
      alert("Settings saved successfully.");
    } catch (err) {
      console.error("Error saving settings:", err);
      alert("Failed to save settings.");
    }
    setLoading(false);
  };

  const toggleAdminStatus = async (userId, currentStatus, email) => {
    // Prevent removing admin from hardcoded admin
    if (email === "nadimanwar794@gmail.com") {
        alert("Cannot change admin status for the master admin.");
        return;
    }

    setLoading(true);
    try {
      await updateDoc(doc(db, "users", userId), {
        isAdmin: !currentStatus
      });
      setUsers(users.map(u => u.id === userId ? { ...u, isAdmin: !currentStatus } : u));
    } catch (err) {
      console.error("Error updating admin status:", err);
      alert("Failed to update user.");
    }
    setLoading(false);
  };

  if (loading) {
    return <div className="p-8 text-center">Loading settings...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center mb-6 gap-4">
            <button onClick={() => navigate(-1)} className="font-bold text-xl bg-white px-3 py-1 rounded shadow">&larr;</button>
            <h1 className="text-2xl font-bold">Admin Settings</h1>
        </div>

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 border-b pb-2">Global Chat Settings</h2>

          <div className="mb-4">
            <label className="block text-gray-700 font-bold mb-2">
              Auto-Delete Messages After (Hours)
            </label>
            <input
              type="number"
              value={autoDeleteHours}
              onChange={(e) => setAutoDeleteHours(e.target.value)}
              className="border rounded px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-600"
              min="1"
            />
            <p className="text-sm text-gray-500 mt-1">Set how long messages persist before being automatically deleted.</p>
          </div>

          <div className="mb-6 flex items-center">
            <input
              type="checkbox"
              id="allowManualDelete"
              checked={allowManualDelete}
              onChange={(e) => setAllowManualDelete(e.target.checked)}
              className="mr-2 h-5 w-5"
            />
            <label htmlFor="allowManualDelete" className="text-gray-700 font-bold">
              Allow users to manually delete messages
            </label>
          </div>

          <button
            onClick={handleSaveSettings}
            disabled={loading}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 font-semibold"
          >
            Save Global Settings
          </button>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4 border-b pb-2">User Management</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="bg-gray-50 text-left text-sm text-gray-600">
                  <th className="py-2 px-4 font-semibold">User</th>
                  <th className="py-2 px-4 font-semibold">Email</th>
                  <th className="py-2 px-4 font-semibold">Admin Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {users.map(user => (
                  <tr key={user.id}>
                    <td className="py-3 px-4">{user.displayName || "Unknown"}</td>
                    <td className="py-3 px-4">{user.email}</td>
                    <td className="py-3 px-4">
                      {user.email === "nadimanwar794@gmail.com" ? (
                          <span className="text-gray-500 font-bold italic">Master Admin</span>
                      ) : (
                        <button
                            onClick={() => toggleAdminStatus(user.id, user.isAdmin, user.email)}
                            className={`text-xs px-3 py-1 rounded font-bold ${user.isAdmin ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
                        >
                            {user.isAdmin ? "Admin (Revoke)" : "Make Admin"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
