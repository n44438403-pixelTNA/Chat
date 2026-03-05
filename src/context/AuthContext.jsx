import React, { createContext, useContext, useEffect, useState } from "react";
import { auth, db, rtdb } from "../firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import { setDoc, doc, getDoc } from "firebase/firestore";
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
      setCurrentUser(user);

      if (user) {
        // Check admin status
        if (user.email === "nadimanwar794@gmail.com") {
          setIsAdmin(true);
        } else {
          try {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists() && userDoc.data().isAdmin) {
              setIsAdmin(true);
            } else {
              setIsAdmin(false);
            }
          } catch (e) {
            console.error("Error fetching admin status:", e);
            setIsAdmin(false);
          }
        }

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
