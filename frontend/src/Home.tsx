import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { auth } from "./firebase";

const Home = () => {
  const [stat, setStat] = useState("checking...");
  const [sock, setSock] = useState("-1");
  const [user, setUser] = useState<User | null>(null);
  const [me, setMe] = useState<{ name: string; elo: number } | null>(null);

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  useEffect(() => {
    if (!user) return setMe(null);

    const load = async () => {
      const token = await user.getIdToken();
      const res = await fetch("/api/me", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) return;
      setMe(await res.json());
    };
    load();
  }, [user]);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch("/api/health");
        setStat(res.ok ? "ok" : "down");
      } catch {
        setStat("down");
      }
    };
    check();
  }, []);

  useEffect(() => {
    if (!user) return;
    const s = io({
      auth: (cb) => {
        user.getIdToken().then((token) => cb({ token }));
      },
    });
    s.on("hello", setSock);
    return () => {
      s.disconnect();
    };
  }, [user]);

  return (
    <>
      <p>
        API: {stat} · socket: {sock}
      </p>
      {user ? (
        <>
          <p>{me ? `${me.name} · Elo ${me.elo}` : "loading..."}</p>
          <button onClick={() => signOut(auth)}>Log out</button>
        </>
      ) : (
        <button onClick={() => signInWithPopup(auth, new GoogleAuthProvider())}>
          Sign in with Google
        </button>
      )}
    </>
  );
};

export default Home;
