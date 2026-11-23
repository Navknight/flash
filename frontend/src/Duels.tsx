import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/lib/theme";
import { useSearchParams } from "react-router";
import Editor from "@monaco-editor/react";
import { io, type Socket } from "socket.io-client";
import { auth, useUser } from "./firebase";
import { tier } from "@/lib/tier";
import RankCard from "@/components/RankCard";
import Panel from "@/components/Panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Test = { input: string; output: string };
type PlayerInfo = {
  uid: string;
  name: string;
  elo: number;
  passed: number;
  submits: number;
};
type MatchInfo = {
  matchId: string;
  ranked: boolean;
  msLeft: number;
  total: number;
  problem: {
    title: string;
    difficulty: string;
    description: string;
    samples: Test[];
  };
  players: PlayerInfo[];
};
type Result = {
  passed: number;
  total: number;
  verdict: string;
  detail: string;
};
type Attempt = {
  uid: string;
  passed: number;
  total: number;
  verdict: string;
  at: number;
};
type EndInfo = {
  winner: string | null;
  reason: string;
  ranked: boolean;
  delta: Record<string, number>;
  names: Record<string, string>;
  attempts: Attempt[];
  code: Record<string, string>;
};

const DIFFICULTIES = [
  { name: "Easy", minutes: 15, color: "text-green-700 dark:text-green-400" },
  {
    name: "Medium",
    minutes: 20,
    color: "text-yellow-700 dark:text-yellow-400",
  },
  { name: "Hard", minutes: 25, color: "text-red-700 dark:text-red-400" },
];
const STARTERS: Record<string, string> = {
  python: "import sys\n\ndata = sys.stdin.read().split()\n\n",
  javascript:
    "const data = require('fs').readFileSync(0, 'utf8').trim().split(/\\s+/);\n\n",
  cpp: "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    \n}\n",
  java: "import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        \n    }\n}\n",
};
const clock = (secs: number) =>
  `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;

export default function Duels() {
  const { theme } = useTheme();
  const socket = useRef<Socket | null>(null);
  const [params, setParams] = useSearchParams();
  const inviteCode = params.get("invite");
  const [phase, setPhase] = useState<
    "lobby" | "queue" | "invite" | "match" | "end"
  >("lobby");
  const [difficulties, setDifficulties] = useState(["Easy", "Medium"]);
  const [myInvite, setMyInvite] = useState("");
  const [match, setMatch] = useState<MatchInfo | null>(null);
  const [language, setLanguage] = useState("python");
  const [code, setCode] = useState<Record<string, string>>(STARTERS);
  const [result, setResult] = useState<Result | null>(null);
  const [pending, setPending] = useState(false);
  const [end, setEnd] = useState<EndInfo | null>(null);
  const [secs, setSecs] = useState(0);
  const [error, setError] = useState("");
  const user = useUser();
  const [elo, setElo] = useState<number | null>(null);

  // phase is in the deps so the rating updates after a ranked match
  useEffect(() => {
    if (!user) return setElo(null);
    user
      .getIdToken()
      .then((token) =>
        fetch("/api/me", { headers: { Authorization: `Bearer ${token}` } }),
      )
      .then((r) => (r.ok ? r.json() : null))
      .then((me) => setElo(me?.elo ?? null));
  }, [user, phase]);

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
    s.on("connect", () => s.emit("duels:resume"));
    s.on("connect_error", () => setError("Sign in to duels"));
    s.on("duels:queued", () => setPhase("queue"));
    s.on("duels:invite", (c: string) => {
      setMyInvite(c);
      setPhase("invite");
    });
    s.on("duels:error", (msg: string) => {
      setError(msg);
      setPhase("lobby");
    });
    s.on("duels:match", (m: MatchInfo) => {
      setMatch(m);
      setPhase("match");
      setEnd(null);
      setResult(null);
      setPending(false);
      setError("");
    });
    s.on("duels:progress", (players: PlayerInfo[]) =>
      setMatch((m) => (m ? { ...m, players } : m)),
    );
    s.on("duels:result", (r: Result) => {
      setResult(r);
      setPending(false);
    });
    s.on("duels:end", (e: EndInfo) => {
      setEnd(e);
      setPhase("end");
    });
    return () => {
      s.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!match || phase !== "match") return;
    const deadline = Date.now() + match.msLeft;
    const tick = () =>
      setSecs(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [match?.matchId, phase]);

  const me = auth.currentUser?.uid;
  const emit = (event: string, arg?: unknown) =>
    socket.current?.emit(event, arg);
  const toggle = (d: string) =>
    setDifficulties((ds) =>
      ds.includes(d) ? ds.filter((x) => x !== d) : [...ds, d],
    );
  const backToLobby = () => {
    setPhase("lobby");
    setMatch(null);
    setEnd(null);
    setResult(null);
    setParams({});
  };

  // ---------- lobby / waiting ----------
  if (phase === "lobby" || phase === "queue" || phase === "invite") {
    return (
      <div className="with-sidebar mx-auto mt-10 max-w-6xl px-4 pb-16">
        <div className="flex min-w-0 flex-col gap-6">
          <h1 className="text-4xl font-extrabold">Duels</h1>
          {error && <p className="text-sm text-destructive">{error}</p>}

          {inviteCode && phase === "lobby" && (
            <Card>
              <CardHeader>
                <CardTitle>You've been challenged</CardTitle>
              </CardHeader>
              <CardContent className="flex gap-2">
                <Button onClick={() => emit("duels:accept", inviteCode)}>
                  Join match
                </Button>
                <Button variant="outline" onClick={() => setParams({})}>
                  Ignore
                </Button>
              </CardContent>
            </Card>
          )}

          {phase === "lobby" && (
            <section>
              <h2 className="text-lg font-extrabold">Difficulty</h2>
              <p className="mb-4 text-sm text-muted-foreground">
                You can pick more than one.
              </p>
              <div className="grid grid-cols-3 gap-3.5">
                {DIFFICULTIES.map((d) => {
                  const on = difficulties.includes(d.name);
                  return (
                    <button
                      key={d.name}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(d.name)}
                      className={`relative flex h-36 flex-col items-center justify-center rounded-xl bg-card hover:bg-muted ${on ? "border-2 border-foreground" : "border border-input"}`}
                    >
                      {on && (
                        <span className="absolute top-3 right-3 grid size-6 place-items-center rounded-md bg-foreground text-xs font-black text-background">
                          ✓
                        </span>
                      )}
                      <span className="text-4xl leading-none sm:text-5xl font-light tabular-nums">
                        {d.minutes}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        minutes
                      </span>
                      <span className={`text-lg font-extrabold ${d.color}`}>
                        {d.name}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-7 flex flex-wrap items-end gap-3.5">
                <label className="flex flex-col gap-1.5 text-sm font-bold">
                  Language
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="h-12 min-w-40 rounded-lg border border-input bg-card px-3 text-base font-semibold"
                  >
                    <option value="python">Python</option>
                    <option value="javascript">JavaScript</option>
                    <option value="cpp">C++</option>
                    <option value="java">Java</option>
                  </select>
                </label>
                <Button
                  className="h-12 px-7 text-base"
                  disabled={difficulties.length === 0}
                  onClick={() => emit("duels:queue", difficulties)}
                >
                  Find match
                </Button>
                <Button
                  variant="outline"
                  className="h-12 px-6 text-base"
                  disabled={difficulties.length === 0}
                  onClick={() => emit("duels:invite", difficulties[0])}
                >
                  Challenge a friend
                </Button>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                Friend matches are unrated.
              </p>
            </section>
          )}

          {phase === "queue" && (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-8">
                <p className="animate-pulse">Looking for an opponent...</p>
                <Button
                  variant="outline"
                  onClick={() => {
                    emit("duels:cancel");
                    setPhase("lobby");
                  }}
                >
                  Cancel
                </Button>
              </CardContent>
            </Card>
          )}

          {phase === "invite" && (
            <Card>
              <CardHeader>
                <CardTitle>Send this link to a friend</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <code className="rounded bg-muted p-2 text-sm">{`${location.origin}/duels?invite=${myInvite}`}</code>
                <div className="flex gap-2">
                  <Button
                    onClick={() =>
                      navigator.clipboard.writeText(
                        `${location.origin}/duels?invite=${myInvite}`,
                      )
                    }
                  >
                    Copy link
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      emit("duels:cancel");
                      setPhase("lobby");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
                <p className="animate-pulse text-sm text-muted-foreground">
                  Waiting for your friend to join...
                </p>
              </CardContent>
            </Card>
          )}
        </div>
        <aside className="flex flex-col gap-5">
          {elo !== null && <RankCard elo={elo} />}
          <Panel title="Rating">
            <div className="grid grid-cols-2 gap-x-3 gap-y-2 tabular-nums">
              <span className="text-muted-foreground">Win vs same rating</span>
              <span>+16</span>
              <span className="text-muted-foreground">Loss vs same rating</span>
              <span>-16</span>
              <span className="text-muted-foreground">Match range</span>
              <span>±100</span>
              <span className="text-muted-foreground">Range grows</span>
              <span>+50 / 10s</span>
            </div>
          </Panel>
        </aside>
      </div>
    );
  }

  // ---------- match ----------
  const diff = DIFFICULTIES.find((d) => d.name === match?.problem.difficulty);
  const won = end?.winner === me;
  // always show yourself on the left
  const all = match?.players ?? [];
  const players = [
    ...all.filter((p) => p.uid === me),
    ...all.filter((p) => p.uid !== me),
  ];
  return (
    <div className="flex flex-col gap-3 p-4 md:h-[calc(100vh-4rem)]">
      <div className="flex flex-wrap items-center gap-6 rounded-xl border bg-card px-5 py-4">
        {players.map((p, i) => {
          const t = tier(p.elo);
          return (
            <div
              key={p.uid}
              className={`min-w-52 flex-1 ${i === 1 ? "order-3" : ""}`}
            >
              <div className="flex justify-between gap-2">
                <span>
                  <b className="font-extrabold">
                    {p.uid === me ? "You" : p.name}
                  </b>{" "}
                  <span className={`font-bold ${t.color}`}>
                    {t.name} {p.elo}
                  </span>
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {p.passed}/{match?.total} tests
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-sm bg-muted">
                <div
                  className={`h-full rounded-sm transition-all ${p.uid === me ? "bg-yellow-500" : "bg-sky-500"}`}
                  style={{
                    width: `${(100 * p.passed) / (match?.total || 1)}%`,
                  }}
                />
              </div>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {p.submits} {p.submits === 1 ? "submission" : "submissions"}
              </p>
            </div>
          );
        })}
        <div className="order-2 text-center">
          <p
            className={`text-5xl leading-none font-extralight tabular-nums ${secs <= 60 ? "animate-pulse text-red-500" : ""}`}
          >
            {clock(secs)}
          </p>
          <p className="text-sm text-muted-foreground">
            {match?.ranked ? "Ranked" : "Unrated"}
          </p>
        </div>
        <Button
          variant="outline"
          className="order-4"
          disabled={phase !== "match"}
          onClick={() => emit("duels:forfeit")}
        >
          Forfeit
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-2">
        <div className="overflow-auto rounded-xl border bg-card p-5">
          <div className="mb-3 flex items-center gap-3">
            <h1 className="text-2xl font-extrabold">{match?.problem.title}</h1>
            <span className={`text-sm font-extrabold ${diff?.color ?? ""}`}>
              {match?.problem.difficulty}
            </span>
          </div>
          <p className="whitespace-pre-wrap leading-relaxed">
            {match?.problem.description}
          </p>
          {match?.problem.samples.map((t, i) => (
            <div key={i} className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="mb-1 font-semibold text-muted-foreground">
                  Sample input
                </p>
                <pre className="rounded-md border bg-muted p-3 font-mono">
                  {t.input}
                </pre>
              </div>
              <div>
                <p className="mb-1 font-semibold text-muted-foreground">
                  Sample output
                </p>
                <pre className="rounded-md border bg-muted p-3 font-mono">
                  {t.output}
                </pre>
              </div>
            </div>
          ))}
        </div>

        <div className="flex min-h-0 flex-col gap-2">
          <div className="flex items-center gap-2">
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="rounded-md border bg-background px-2 py-1 text-sm"
            >
              <option value="python">Python</option>
              <option value="javascript">JavaScript</option>
              <option value="cpp">C++</option>
              <option value="java">Java</option>
            </select>
            <Button
              size="sm"
              disabled={pending || phase !== "match"}
              onClick={() => {
                setPending(true);
                setResult(null);
                emit("duels:submit", { language, code: code[language] });
              }}
            >
              {pending ? "Running..." : "Submit"}
            </Button>
          </div>
          <div className="h-96 overflow-hidden rounded-xl border md:h-auto md:min-h-0 md:flex-1">
            <Editor
              theme={theme === "dark" ? "vs-dark" : "light"}
              language={language}
              value={code[language]}
              onChange={(v) => setCode((c) => ({ ...c, [language]: v ?? "" }))}
              options={{
                fontSize: 14,
                minimap: { enabled: false },
                fontFamily: "JetBrains Mono, monospace",
              }}
            />
          </div>
          {result && (
            <div className="max-h-48 overflow-auto rounded-md border p-3 text-sm">
              <p
                className={
                  result.verdict === "Accepted"
                    ? "text-green-500"
                    : "text-red-500"
                }
              >
                {result.verdict}: {result.passed}/{result.total} tests
              </p>
              {result.detail && (
                <pre className="mt-2 whitespace-pre-wrap font-mono text-xs">
                  {result.detail}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ---------- post-match ---------- */}
      <Dialog
        open={phase === "end"}
        onOpenChange={(open) => !open && backToLobby()}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-center text-3xl">
              {end?.winner === null ? "Draw" : won ? "Victory" : "Defeat"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-center text-muted-foreground">
            {end?.reason === "solved" &&
              (won
                ? "You passed every test first."
                : "Your opponent passed every test first.")}
            {end?.reason === "forfeit" &&
              (won ? "Your opponent forfeited." : "You forfeited.")}
            {end?.reason === "time" && "Time ran out."}
          </p>
          {end?.ranked ? (
            <p
              className={`text-center font-mono text-xl ${(end.delta[me ?? ""] ?? 0) >= 0 ? "text-green-500" : "text-red-500"}`}
            >
              {(end.delta[me ?? ""] ?? 0) >= 0 ? "+" : ""}
              {end.delta[me ?? ""] ?? 0} Elo
            </p>
          ) : (
            <p className="text-center text-sm text-muted-foreground">
              Casual match, no rating change
            </p>
          )}

          <div className="text-sm">
            <p className="mb-1 font-medium">Attempts</p>
            {end?.attempts.length === 0 && (
              <p className="text-muted-foreground">No submissions.</p>
            )}
            {end?.attempts.map((a, i) => (
              <div key={i} className="flex justify-between border-b py-1">
                <span>{a.uid === me ? "You" : end.names[a.uid]}</span>
                <span
                  className={
                    a.verdict === "Accepted" ? "text-green-500" : "text-red-500"
                  }
                >
                  {a.verdict}
                </span>
              </div>
            ))}
          </div>

          <Tabs defaultValue="mine">
            <TabsList>
              <TabsTrigger value="mine">Your code</TabsTrigger>
              <TabsTrigger value="theirs">Opponent's code</TabsTrigger>
            </TabsList>
            {(["mine", "theirs"] as const).map((tab) => {
              const uid =
                tab === "mine"
                  ? me
                  : match?.players.find((p) => p.uid !== me)?.uid;
              return (
                <TabsContent key={tab} value={tab}>
                  <pre className="max-h-64 overflow-auto rounded bg-muted p-3 font-mono text-xs">
                    {end?.code[uid ?? ""] ?? "No submission."}
                  </pre>
                </TabsContent>
              );
            })}
          </Tabs>
          <Button onClick={backToLobby}>Back to lobby</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
