import { useEffect, useState } from "react";
import { io } from "socket.io-client";

const Home = () => {
  const [stat, setStat] = useState("checking...");
  const [sock, setSock] = useState("-1");
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
    const s = io();
    s.on("hello", (id) => setSock(id));
    return () => {
      s.disconnect();
    };
  }, []);
  return (
    <>
      {stat}
      {sock}
    </>
  );
};

export default Home;
