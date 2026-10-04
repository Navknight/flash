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

import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const Home = () => {
  const [stat, setStat] = useState("checking...");
  const [sock, setSock] = useState("-1");
  const [user, setUser] = useState<User | null>(null);
  const [me, setMe] = useState<{ name: string; elo: number } | null>(null);

  type Deck = {
    id: number;
    title: string;
    subject: string;
    owner: string;
    cards: number;
  };
  const [decks, setDecks] = useState<Deck[]>([]);
  useEffect(() => {
    fetch("/api/decks")
      .then((r) => r.json())
      .then(setDecks);
  }, []);

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

      {user && (
        <Link to="/upload" className="underline">
          Upload a deck
        </Link>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Subject</TableHead>
            <TableHead>Cards</TableHead>
            <TableHead>By</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {decks.map((d) => (
            <TableRow key={d.id}>
              <TableCell className="font-medium">{d.title}</TableCell>
              <TableCell>
                <Badge variant="secondary">{d.subject}</Badge>
              </TableCell>
              <TableCell>{d.cards}</TableCell>
              <TableCell className="text-muted-foreground">{d.owner}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
};

export default Home;
