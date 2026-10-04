import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

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
