import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { io, type Socket } from "socket.io-client";
import { auth } from "./firebase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Practice from "./Practice";
import IndexCard from "@/components/IndexCard";
import Panel from "@/components/Panel";

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
type Answered = {
  prompt: string;
  picked: string;
  answer: string;
  correct: boolean;
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

  const [history, setHistory] = useState<Answered[]>([]);
  const pending = useRef<{ prompt: string; picked: string } | null>(null);
  // true while flipping through the missed questions after a race
  const [practicing, setPracticing] = useState(false);

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
      // new race starting, so clear old history and get out of practice mode
      if (next.index === 0) {
        setHistory([]);
        setPracticing(false);
      }
    });
    s.on("result", (r: { correct: boolean; answer: string }) => {
      setResult(r);
      const p = pending.current;
      if (p) setHistory((h) => [...h, { ...p, ...r }]);
    });
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
  const sendAnswer = useCallback((question: Question, option: string) => {
    setPicked(option);
    pending.current = { prompt: question.prompt, picked: option };
    socket.current?.emit("answer", { index: question.index, option });
  }, []);

  const pick = (option: string) => {
    if (picked || !q) return;
    sendAnswer(q, option);
  };

  useEffect(() => {
    if (!q || picked) return;
    const onKey = (e: KeyboardEvent) => {
      const option = q.options[Number(e.key) - 1];
      if (!option || e.repeat) return;
      sendAnswer(q, option);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [q, picked, sendAnswer]);

  useEffect(() => {
    if (!result) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = result.correct ? 880 : 220;
    gain.gain.value = 0.1;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
    osc.onended = () => ctx.close();
  }, [result]);

  const color = (opt: string) =>
    !result
      ? opt === picked
        ? "border-foreground"
        : ""
      : opt === result.answer
        ? "border-good bg-good/15"
        : opt === picked
          ? "border-destructive bg-destructive/10 animate-shake"
          : "opacity-50";

  if (error)
    return <p className="mt-10 text-center text-muted-foreground">{error}</p>;
  if (!snap)
    return (
      <p className="mt-10 text-center text-muted-foreground">Connecting...</p>
    );

  const racing = snap.phase === "race" && me?.racing && !me.done && q;
  const missed = history.filter((h) => !h.correct);

  return (
    <div className="with-sidebar mx-auto mt-8 max-w-6xl px-4 pb-16">
      {racing ? (
        <section>
          <div className="mb-4 flex items-end justify-between gap-4">
            <p className="text-xl font-extrabold">
              Question {q.index + 1}/{snap.total}
            </p>
            <div className="text-right">
              <span
                className={`text-6xl leading-none font-light tabular-nums ${
                  secs <= 5 ? "animate-pulse text-red-500" : ""
                }`}
              >
                {String(secs).padStart(2, "0")}
              </span>
              <p className="text-xs text-muted-foreground">sec</p>
            </div>
          </div>
          <IndexCard corner={q.index + 1}>
            <div className="flex min-h-40 flex-col gap-4">
              {q.imageUrl && (
                <img
                  src={q.imageUrl}
                  alt=""
                  className="max-h-64 self-center rounded"
                  onError={(e) => (e.currentTarget.style.display = "none")}
                />
              )}
              <p className="text-3xl font-extrabold">{q.prompt}</p>
            </div>
          </IndexCard>
          <div className="mt-5 flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {q.options.map((opt, i) => (
                <button
                  key={opt}
                  type="button"
                  className={`flex items-center gap-3.5 rounded-lg border border-input bg-card px-4 py-3.5 text-left text-base font-bold hover:bg-muted ${color(opt)}`}
                  onClick={() => pick(opt)}
                >
                  <kbd className="grid size-6 shrink-0 place-items-center rounded-md border bg-muted text-xs font-extrabold text-muted-foreground">
                    {i + 1}
                  </kbd>
                  {opt}
                </button>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              Press 1-{q.options.length} to answer
            </p>
          </div>
        </section>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>
              {snap.phase === "race"
                ? me?.racing
                  ? `Finished! Waiting for others... ${secs}s`
                  : "Race in progress, you're in the next one"
                : snap.phase === "countdown"
                  ? "Get Ready!"
                  : "Waiting for another player..."}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {snap.phase === "countdown" && (
              <p
                key={secs}
                className="py-6 text-center font-heading text-7xl font-bold text-primary animate-in zoom-in-50"
              >
                {secs}
              </p>
            )}
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

            {history.length > 0 && (
              <div className="mt-4 flex flex-col gap-2">
                <p className="text-sm text-muted-foreground">
                  {missed.length === 0
                    ? "Perfect run, nothing to review."
                    : `Review: you missed ${missed.length} of ${history.length}`}
                </p>
                {/* show either the flashcards or the list, not both */}
                {practicing ? (
                  <Practice
                    cards={missed}
                    onClose={() => setPracticing(false)}
                  />
                ) : (
                  missed.map((m, i) => (
                    <div key={i} className="rounded border p-3 text-sm">
                      <p className="font-medium">{m.prompt}</p>
                      <p className="text-red-500">Your answer: {m.picked}</p>
                      <p className="text-green-600">
                        Correct answer: {m.answer}
                      </p>
                    </div>
                  ))
                )}
                {missed.length > 0 && !practicing && (
                  <Button
                    className="self-start"
                    onClick={() => setPracticing(true)}
                  >
                    Practice mistakes
                  </Button>
                )}
              </div>
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
        </Card>
      )}

      <aside className="flex flex-col gap-5">
        <Panel title="Players">
          <div className="flex flex-col gap-5">
            {snap.players.map((p) => (
              <div key={p.uid}>
                <div className="flex justify-between">
                  <span className="font-bold">
                    <Link to={`/u/${p.uid}`} className="hover:underline">
                      {p.uid === me?.uid ? "You" : p.name}
                    </Link>
                    {p.done && (
                      <span className="ml-2 text-sm font-semibold text-good">
                        done
                      </span>
                    )}
                  </span>
                  {snap.phase === "race" && !p.racing ? (
                    <span className="text-muted-foreground">spectating</span>
                  ) : (
                    <span className="tabular-nums">{p.score}</span>
                  )}
                </div>
                {snap.phase === "race" && p.racing && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full transition-all ${p.uid === me?.uid ? "bg-yellow-500" : "bg-foreground"}`}
                      style={{ width: `${(100 * p.progress) / snap.total}%` }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Top scores">
          {board.length === 0 && (
            <p className="text-muted-foreground">No races on this deck yet.</p>
          )}
          <div className="flex flex-col gap-2">
            {board.map((b, i) => (
              <div key={b.uid} className="flex items-baseline gap-3">
                <span className="w-4 text-muted-foreground">{i + 1}</span>
                <Link
                  to={`/u/${b.uid}`}
                  className="flex-1 truncate font-bold hover:underline"
                >
                  {b.name}
                </Link>
                <span className="tabular-nums">{b.best}</span>
                <span className="text-sm text-muted-foreground">
                  {b.games} {b.games === 1 ? "game" : "games"}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </aside>
    </div>
  );
}
