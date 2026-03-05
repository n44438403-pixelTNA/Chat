import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { db, auth } from "../firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import { updateEmail, updatePassword, updateProfile as updateAuthProfile } from "firebase/auth";

const Profile = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [profileUser, setProfileUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Edit states for current user
  const isMe = currentUser && currentUser.uid === userId;
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhotoUrl, setEditPhotoUrl] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [updateMsg, setUpdateMsg] = useState("");
  const [updateError, setUpdateError] = useState("");

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const userDoc = await getDoc(doc(db, "users", userId));
        if (userDoc.exists()) {
          const data = userDoc.data();
          setProfileUser(data);
          if (isMe) {
              setEditName(data.displayName || "");
              setEditPhotoUrl(data.photoURL || "");
              setEditEmail(currentUser.email || "");
          }
        } else {
          setProfileUser(null);
        }
      } catch (err) {
        console.error("Error fetching user profile:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchUser();
  }, [userId, isMe, currentUser?.email]);

  if (loading) {
    return <div className="p-4 flex items-center justify-center min-h-screen text-gray-500">Loading profile...</div>;
  }

  const handleUpdateProfile = async (e) => {
      e.preventDefault();
      setUpdateMsg("");
      setUpdateError("");

      try {
          // Update Auth Profile
          await updateAuthProfile(auth.currentUser, {
              displayName: editName,
              photoURL: editPhotoUrl
          });

          // Update Firestore Profile
          await updateDoc(doc(db, "users", userId), {
              displayName: editName,
              photoURL: editPhotoUrl
          });

          let emailChanged = false;
          // Update Email if changed
          if (editEmail && editEmail !== currentUser.email) {
              await updateEmail(auth.currentUser, editEmail);
              await updateDoc(doc(db, "users", userId), { email: editEmail });
              emailChanged = true;
          }

          // Update Password if provided
          if (editPassword) {
              await updatePassword(auth.currentUser, editPassword);
          }

          // Refresh local state
          setProfileUser(prev => ({
              ...prev,
              displayName: editName,
              photoURL: editPhotoUrl,
              email: emailChanged ? editEmail : prev.email
          }));

          setEditPassword(""); // clear password field
          setIsEditing(false);
          setUpdateMsg("Profile updated successfully!");

      } catch (err) {
          console.error("Error updating profile:", err);
          if (err.code === 'auth/requires-recent-login') {
             setUpdateError("Changing email/password requires a recent login. Please log out and log back in, then try again.");
          } else {
             setUpdateError(err.message);
          }
      }
  };

  if (!profileUser) {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
            <h2 className="text-xl font-bold text-gray-700">User not found</h2>
            <button onClick={() => navigate(-1)} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded">Go Back</button>
        </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-md mx-auto bg-white rounded-lg shadow overflow-hidden relative">
        <header className="bg-blue-600 p-4 text-white flex items-center justify-between">
          <div className="flex items-center">
              <button onClick={() => navigate(-1)} className="mr-4 font-bold text-xl hover:text-gray-200">
                &larr;
              </button>
              <h1 className="text-xl font-bold">User Profile</h1>
          </div>
          {isMe && !isEditing && (
              <button onClick={() => {setIsEditing(true); setUpdateMsg(""); setUpdateError("");}} className="text-sm bg-blue-700 hover:bg-blue-800 px-3 py-1 rounded transition">
                  Edit Profile
              </button>
          )}
        </header>

        {updateMsg && <div className="bg-green-100 text-green-700 p-3 text-center border-b border-green-200">{updateMsg}</div>}
        {updateError && <div className="bg-red-100 text-red-700 p-3 text-center border-b border-red-200">{updateError}</div>}

        {isEditing ? (
            <form onSubmit={handleUpdateProfile} className="p-6 flex flex-col gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
                    <input
                        type="text"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        className="w-full px-3 py-2 border rounded focus:ring-1 focus:ring-blue-600 focus:outline-none"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Profile Photo URL (Optional)</label>
                    <input
                        type="url"
                        value={editPhotoUrl}
                        onChange={e => setEditPhotoUrl(e.target.value)}
                        placeholder="https://example.com/photo.jpg"
                        className="w-full px-3 py-2 border rounded focus:ring-1 focus:ring-blue-600 focus:outline-none text-sm"
                    />
                    {editPhotoUrl && <img src={editPhotoUrl} alt="Preview" className="mt-2 w-16 h-16 rounded-full object-cover border" />}
                </div>

                <hr className="my-2" />
                <h3 className="font-semibold text-gray-800">Account Security</h3>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                    <input
                        type="email"
                        value={editEmail}
                        onChange={e => setEditEmail(e.target.value)}
                        className="w-full px-3 py-2 border rounded focus:ring-1 focus:ring-blue-600 focus:outline-none"
                        required
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                    <input
                        type="password"
                        value={editPassword}
                        onChange={e => setEditPassword(e.target.value)}
                        placeholder="Leave blank to keep current"
                        className="w-full px-3 py-2 border rounded focus:ring-1 focus:ring-blue-600 focus:outline-none"
                        minLength="6"
                    />
                </div>

                <div className="flex gap-2 mt-4">
                    <button type="submit" className="flex-1 bg-blue-600 text-white py-2 rounded font-semibold hover:bg-blue-700">Save Changes</button>
                    <button type="button" onClick={() => setIsEditing(false)} className="flex-1 bg-gray-200 text-gray-800 py-2 rounded font-semibold hover:bg-gray-300">Cancel</button>
                </div>
            </form>
        ) : (
            <div className="p-6 flex flex-col items-center">
                {profileUser.photoURL ? (
                    <img
                        src={profileUser.photoURL}
                        alt="Profile"
                        className="w-32 h-32 rounded-full object-cover border-4 border-blue-500 shadow-lg mb-4"
                    />
                ) : (
                    <div className="w-32 h-32 rounded-full bg-blue-100 flex items-center justify-center border-4 border-blue-500 shadow-lg mb-4">
                        <span className="text-blue-500 text-4xl font-bold">
                            {profileUser.displayName ? profileUser.displayName.charAt(0).toUpperCase() : (profileUser.email ? profileUser.email.charAt(0).toUpperCase() : '?')}
                        </span>
                    </div>
                )}

                <h2 className="text-2xl font-bold text-gray-800 mb-1">{profileUser.displayName || "Unknown User"}</h2>
                <p className="text-gray-500 text-sm mb-6">{profileUser.email}</p>

                <div className="w-full bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-700 mb-3 border-b pb-2">Chat Stats</h3>
                    <div className="grid grid-cols-2 gap-4 text-center">
                        <div className="bg-white p-3 rounded shadow-sm border border-gray-100">
                            <p className="text-sm text-gray-500 uppercase tracking-wide">Messages</p>
                            <p className="text-2xl font-bold text-blue-600">{profileUser.messageCount || 0}</p>
                        </div>
                        <div className="bg-white p-3 rounded shadow-sm border border-gray-100">
                            <p className="text-sm text-gray-500 uppercase tracking-wide">Words Sent</p>
                            <p className="text-2xl font-bold text-green-600">{profileUser.wordCount || 0}</p>
                        </div>
                    </div>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};

export default Profile;