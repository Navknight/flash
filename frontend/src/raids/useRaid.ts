import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { auth } from "../firebase";
import type {
  AnswerResult,
  CreateInput,
  EmoteEvent,
  EndInfo,
  FeedItem,
  NewQuestion,
  NextResult,
  RaidRanking,
  RaidState,
  RaidSummary,
} from "./types";

type Reply = { ok: boolean; error?: string };

const STORAGE_KEY = "raidCode"; // lets a page refresh drop you back into your raid
let feedId = 0;
let emoteId = 0;

// Pass the signed-in user's uid. No uid = no socket (the server needs a login token).
export function useRaid(uid: string | undefined) {
  const socketRef = useRef<Socket | null>(null);
  const codeRef = useRef<string | null>(sessionStorage.getItem(STORAGE_KEY));
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [state, setState] = useState<RaidState | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [end, setEnd] = useState<EndInfo | null>(null);
  const [emotes, setEmotes] = useState<EmoteEvent[]>([]);

  // emit + wait for the server's { ok, ... } acknowledgement, as a promise
  const call = useCallback(
    <T extends object>(event: string, payload?: unknown) =>
      new Promise<T>((resolve, reject) => {
        const s = socketRef.current;
        if (!s) {
          reject(new Error("Not connected"));
          return;
        }
        s.timeout(8000).emit(
          event,
          payload,
          (err: Error | null, res: Reply & T) => {
            if (err) reject(new Error("The server did not respond"));
            else if (!res.ok)
              reject(new Error(res.error ?? "Something went wrong"));
            else resolve(res);
          },
        );
      }),
    [],
  );

  const applyState = useCallback((s: RaidState) => {
    codeRef.current = s.code;
    sessionStorage.setItem(STORAGE_KEY, s.code);
    setState(s);
    // opening a finished raid shows its results straight away
    setEnd(
      s.status === "won" || s.status === "lost"
        ? { result: s.status, leaderboard: s.players, badges: s.badges }
        : null,
    );
  }, []);

  const join = useCallback(
    async (code: string) => {
      const res = await call<{ state: RaidState }>("raid:join", { code });
      setFeed([]);
      setEmotes([]);
      applyState(res.state);
    },
    [call, applyState],
  );

  useEffect(() => {
    if (!uid) return;

    const s = io("/raids", {
      auth: (cb) => {
        auth
          .authStateReady()
          .then(() => auth.currentUser?.getIdToken())
          .then((token) => cb({ token }));
      },
    });
    socketRef.current = s;

    s.on("connect", () => {
      setConnected(true);
      setError("");
      // (re)connect: pull a fresh snapshot of the raid we were in
      if (codeRef.current) {
        join(codeRef.current).catch(() => {
          codeRef.current = null;
          sessionStorage.removeItem(STORAGE_KEY);
        });
      }
    });
    s.on("disconnect", () => setConnected(false));
    s.on("connect_error", (err) => {
      console.error("[raids] connect_error:", err.message);
      setError("Could not connect to raids. Try signing in again.");
    });

    s.on("raid:player-joined", (p: { uid: string; name: string }) =>
      setState((st) => {
        if (!st || st.players.some((x) => x.uid === p.uid)) return st;
        return {
          ...st,
          players: [
            ...st.players,
            { ...p, totalDamage: 0, correct: 0, answered: 0 },
          ],
        };
      }),
    );

    // in the lobby, someone leaving disappears from the party list
    s.on("raid:player-left", (p: { uid: string }) =>
      setState((st) =>
        st && st.status === "lobby"
          ? { ...st, players: st.players.filter((x) => x.uid !== p.uid) }
          : st,
      ),
    );

    s.on("raid:started", (e: { endsAt: number }) =>
      setState((st) =>
        st ? { ...st, status: "active" as const, endsAt: e.endsAt } : st,
      ),
    );

    s.on(
      "raid:damage",
      (d: {
        uid: string;
        name: string;
        damage: number;
        correct: boolean;
        hpRemaining: number;
        streak: number;
      }) => {
        setState((st) =>
          st
            ? {
                ...st,
                hpRemaining: d.hpRemaining,
                players: st.players.map((p) =>
                  p.uid === d.uid
                    ? {
                        ...p,
                        totalDamage: p.totalDamage + d.damage,
                        correct: p.correct + (d.correct ? 1 : 0),
                        answered: p.answered + 1,
                      }
                    : p,
                ),
              }
            : st,
        );
        setFeed((f) =>
          [
            {
              id: ++feedId,
              uid: d.uid,
              name: d.name,
              damage: d.damage,
              correct: d.correct,
              streak: d.streak,
            },
            ...f,
          ].slice(0, 30),
        );
      },
    );

    s.on("raid:emote", (e: { uid: string; emote: string }) =>
      setEmotes((list) => [...list, { id: ++emoteId, ...e }].slice(-20)),
    );

    s.on("raid:ended", (e: EndInfo) => {
      setEnd(e);
      setState((st) => (st ? { ...st, status: e.result } : st));
    });

    return () => {
      s.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [uid, join]);

  const create = useCallback(
    async (input: CreateInput) => {
      const { code } = await call<{ code: string }>("raid:create", input);
      await join(code);
    },
    [call, join],
  );

  const start = useCallback(async () => {
    await call("raid:start", { code: codeRef.current });
  }, [call]);

  // host only: finish the raid for everyone right now
  const endRaid = useCallback(async () => {
    await call("raid:end", { code: codeRef.current });
  }, [call]);

  // raids I have played (newest first), for the history list
  const mine = useCallback(
    async () => (await call<{ raids: RaidSummary[] }>("raid:mine")).raids,
    [call],
  );

  // multiple choice cards of a deck, converted into raid questions
  const deckQuestions = useCallback(
    (deckId: number) =>
      call<{ questions: NewQuestion[]; skipped: number }>(
        "raid:deck-questions",
        { deckId },
      ),
    [call],
  );

  // fire and forget: a little emoji pops up above my character for everyone
  const sendEmote = useCallback((emote: string) => {
    socketRef.current?.emit("raid:emote", { code: codeRef.current, emote });
  }, []);

  // top raiders over all finished raids
  const leaderboard = useCallback(
    async () =>
      (await call<{ players: RaidRanking[] }>("raid:leaderboard")).players,
    [call],
  );

  const next = useCallback(
    () => call<NextResult>("raid:next", { code: codeRef.current }),
    [call],
  );

  const answer = useCallback(
    (questionId: number, choiceIndex: number) =>
      call<AnswerResult>("raid:answer", {
        code: codeRef.current,
        questionId,
        choiceIndex,
      }),
    [call],
  );

  const leave = useCallback(() => {
    if (codeRef.current)
      socketRef.current?.emit("raid:leave", { code: codeRef.current });
    codeRef.current = null;
    sessionStorage.removeItem(STORAGE_KEY);
    setState(null);
    setEnd(null);
    setFeed([]);
    setEmotes([]);
  }, []);

  return {
    connected,
    error,
    state,
    feed,
    end,
    create,
    join,
    start,
    endRaid,
    mine,
    deckQuestions,
    leaderboard,
    sendEmote,
    emotes,
    next,
    answer,
    leave,
  };
}