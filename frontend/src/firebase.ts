import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";

export function useUser() {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  useEffect(() => onAuthStateChanged(auth, setUser), []);
  return user;
}
const firebaseConfig = {
  apiKey: "AIzaSyAYvENswnVkylB2x4sl8O6k_tw4yHruaWQ",
  authDomain: "flash-57b36.firebaseapp.com",
  projectId: "flash-57b36",
  storageBucket: "flash-57b36.firebasestorage.app",
  messagingSenderId: "999823189263",
  appId: "1:999823189263:web:3e1b14d777cbe529110a7a",
  measurementId: "G-G7D3MD9702",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
