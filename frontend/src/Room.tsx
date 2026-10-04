import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { io, type Socket } from "socket.io-client";
import { auth } from "./firebase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type PlayerInfo = {
  uid: string;
  name: string;
  racing: boolean;
  progress: number;
  score: number;
  correct: number;
  done: boolean;
};
type Snapshot = {
  phase: "lobby" | "countdown" | "race";
  msLeft: number;
  total: number;
  players: PlayerInfo[];
};
type Question = {
  index: number;
  prompt: string;
  options: string[];
  imageUrl: string | null;
};

export default function Room() {
  const { deckId } = useParams();
  const socket = useRef<Socket | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [q, setQ] = useState<Question | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [result, setResult] = useState<{
    correct: boolean;
    answer: string;
  } | null>(null);
  const [standings, setStandings] = useState<PlayerInfo[] | null>(null);
  const [secs, setSecs] = useState(0);
  const [error, setError] = useState("");

  type Best = { uid: string; name: string; best: number; games: number };
  const [board, setBoard] = useState<Best[]>([]);
  const loadBoard = useCallback(() => {
    fetch(`/api/decks/${deckId}/leaderboard`)
      .then((r) => r.json())
      .then(setBoard);
  }, [deckId]);
  useEffect(loadBoard, [loadBoard]);

  useEffect(() => {
    const s = io({
      auth: (cb) => {
        auth
          .authStateReady()
          .then(() => auth.currentUser?.getIdToken())
          .then((token) => cb({ token }));
      },
    });
    socket.current = s;
    s.on("connect", () => s.emit("join", Number(deckId)));
    s.on("connect_error", () => setError("Sign in to play"));
    s.on("state", setSnap);
    s.on("question", (next: Question) => {
      setQ(next);
      setPicked(null);
      setResult(null);
      setStandings(null);
    });
    s.on("result", setResult);
    s.on("end", (final: PlayerInfo[]) => {
      setStandings(final);
      setQ(null);
      loadBoard();
    });
    return () => {
      s.disconnect();
    };
  }, [deckId, loadBoard]);

  useEffect(() => {
    if (!snap || snap.phase === "lobby") return;
    const deadline = Date.now() + snap.msLeft;
    const tick = () =>
      setSecs(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [snap]);

  const me = snap?.players.find((p) => p.uid === auth.currentUser?.uid);

  const pick = (option: string) => {
    if (picked || !q) return;
    setPicked(option);
    socket.current?.emit("answer", { index: q.index, option });
  };

  const color = (opt: string) =>
    !result
      ? opt === picked
        ? "ring-2 ring-primary"
        : ""
      : opt === result.answer
        ? "bg-green-600 hover:bg-green-600"
        : opt === picked
          ? "bg-red-600 hover:bg-red-600"
          : "opacity-50";

  if (error)
    return <p className="mt-10 text-center text-muted-foreground">{error}</p>;
  if (!snap)
    return (
      <p className="mt-10 text-center text-muted-foreground">Connecting...</p>
    );

  const racing = snap.phase === "race" && me?.racing && !me.done && q;

  return (
    <div className="mx-auto mt-8 grid max-w-5xl gap-6 px-4 md:grid-cols-[1fr_260px]">
      <Card>
        {racing ? (
          <>
            <CardHeader className="flex flex-row justify-between text-sm text-muted-foreground">
              <span>
                Question {q.index + 1}/{snap.total}
              </span>
              <span className="font-mono">{secs}s</span>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {q.imageUrl && (
                <img
                  src={q.imageUrl}
                  alt=""
                  className="max-h-64 self-center rounded"
                  onError={(e) => (e.currentTarget.style.display = "none")}
                />
              )}
              <p className="text-xl font-semibold">{q.prompt}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {q.options.map((opt) => (
                  <Button
                    key={opt}
                    variant="secondary"
                    className={`h-auto whitespace-normal py-3 ${color(opt)}`}
                    onClick={() => pick(opt)}
                  >
                    {opt}
                  </Button>
                ))}
              </div>
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader>
              <CardTitle>
                {snap.phase === "race"
                  ? me?.racing
                    ? `Finished! Waiting for others... ${secs}s`
                    : "Race in progress, you're in the next one"
                  : snap.phase === "countdown"
                    ? `Starting in ${secs}s`
                    : "Waiting for another player..."}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {standings && (
                <>
                  <p className="text-sm text-muted-foreground">Last race</p>
                  {standings.map((p, i) => (
                    <div key={p.uid} className="flex justify-between">
                      <span>
                        {i + 1}. {p.name}
                      </span>
                      <span className="font-mono">
                        {p.correct}/{snap.total} · {p.score}
                      </span>
                    </div>
                  ))}
                </>
              )}
              <Button
                variant="outline"
                className="mt-4 self-start"
                render={<Link to="/" />}
              >
                Leave
              </Button>
              {snap.phase === "lobby" && snap.players.length === 1 && (
                <Button
                  className="mt-4 self-start"
                  onClick={() => socket.current?.emit("solo")}
                >
                  Play solo
                </Button>
              )}
            </CardContent>
          </>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Players</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {snap.players.map((p) => (
            <div key={p.uid} className="flex flex-col gap-1">
              <div className="flex justify-between text-sm">
                <span>
                  {p.name}
                  {p.done ? " ✓" : ""}
                </span>
                <span className="font-mono">{p.score}</span>
              </div>
              {snap.phase === "race" && p.racing && (
                <div className="h-1.5 rounded bg-muted">
                  <div
                    className="h-full rounded bg-primary transition-all"
                    style={{ width: `${(100 * p.progress) / snap.total}%` }}
                  />
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Deck leaderboard</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          {board.length === 0 && (
            <p className="text-muted-foreground">No runs yet, be the first.</p>
          )}
          {board.map((b, i) => (
            <div key={b.uid} className="flex justify-between">
              <span>
                {i + 1}. {b.name}
              </span>
              <span className="font-mono">
                {b.best}{" "}
                <span className="text-muted-foreground">· {b.games}g</span>
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
