import React, { createContext, useContext, useEffect, useState } from "react";
import { auth, db, rtdb } from "../firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import { setDoc, doc, getDoc, deleteDoc } from "firebase/firestore";
import { ref, onValue, onDisconnect, set, serverTimestamp } from "firebase/database";

export const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const signup = async (email, password, displayName) => {
    const res = await createUserWithEmailAndPassword(auth, email, password);
    // Create a user document in Firestore
    await setDoc(doc(db, "users", res.user.uid), {
      uid: res.user.uid,
      displayName,
      email,
      photoURL: res.user.photoURL,
    });
    return res;
  };

  const login = (email, password) => {
    return signInWithEmailAndPassword(auth, email, password);
  };

  const logout = async () => {
    if (currentUser) {
      const userStatusDatabaseRef = ref(rtdb, '/status/' + currentUser.uid);
      await set(userStatusDatabaseRef, {
        state: 'offline',
        last_changed: serverTimestamp(),
      });
    }
    return signOut(auth);
  };

  useEffect(() => {
    let connectedRefUnsubscribe;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
            // Check if user is soft-deleted
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists()) {
                const data = userDoc.data();
                if (data.deletedAt) {
                    const deletedAtMs = data.deletedAt.toMillis();
                    const nowMs = Date.now();
                    const daysSinceDeletion = (nowMs - deletedAtMs) / (1000 * 60 * 60 * 24);

                    if (daysSinceDeletion >= 90) {
                        // Permanently delete Firestore doc (Authentication deletion requires admin SDK or recent re-auth, so we just sign them out after cleaning DB)
                        await deleteDoc(doc(db, "users", user.uid));
                        await signOut(auth);
                        setCurrentUser(null);
                        setLoading(false);
                        alert("Your account has been permanently deleted.");
                        return;
                    } else {
                        await signOut(auth);
                        setCurrentUser(null);
                        setLoading(false);
                        alert(`Your account is scheduled for deletion. It will be permanently deleted in ${Math.ceil(90 - daysSinceDeletion)} days.`);
                        return;
                    }
                }
            }

            // Check admin status
            if (user.email === "nadimanwar794@gmail.com") {
              setIsAdmin(true);
            } else {
              if (userDoc.exists() && userDoc.data().isAdmin) {
                setIsAdmin(true);
              } else {
                setIsAdmin(false);
              }
            }
        } catch (e) {
            console.error("Error during auth state check:", e);
            setIsAdmin(false);
        }

        setCurrentUser(user);

        const userStatusDatabaseRef = ref(rtdb, '/status/' + user.uid);
        const isOfflineForDatabase = {
          state: 'offline',
          last_changed: serverTimestamp(),
        };
        const isOnlineForDatabase = {
          state: 'online',
          last_changed: serverTimestamp(),
        };

        const connectedRef = ref(rtdb, '.info/connected');
        connectedRefUnsubscribe = onValue(connectedRef, (snap) => {
          if (snap.val() === true) {
            onDisconnect(userStatusDatabaseRef).set(isOfflineForDatabase).then(() => {
              set(userStatusDatabaseRef, isOnlineForDatabase);
            });
          }
        });
      } else {
        setIsAdmin(false);
      }
      setLoading(false);
    });

    return () => {
      unsubscribe();
      if (connectedRefUnsubscribe) {
        connectedRefUnsubscribe(); // Assuming onValue returns an unsubscribe function (it does in modular SDK)
      }
    };
  }, [currentUser]);

  const value = {
    currentUser,
    isAdmin,
    signup,
    login,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
