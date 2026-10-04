import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import Editor from "@monaco-editor/react";
import { io, type Socket } from "socket.io-client";
import { auth } from "./firebase";
import { tier } from "@/lib/tier";
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
  { name: "Easy", minutes: 15, color: "text-green-500" },
  { name: "Medium", minutes: 20, color: "text-yellow-500" },
  { name: "Hard", minutes: 25, color: "text-red-500" },
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
      <div className="mx-auto mt-10 flex max-w-xl flex-col gap-6 px-4">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Duels</h1>
          <p className="text-muted-foreground">
            Same problem, two players. First to pass every test wins.
          </p>
        </div>
        {error && <p className="text-center text-sm text-red-500">{error}</p>}

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
          <Card>
            <CardHeader>
              <CardTitle>Set up the match</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div>
                <p className="mb-2 text-sm text-muted-foreground">
                  Difficulties you're happy to play. The problem sets the timer.
                </p>
                <div className="flex gap-2">
                  {DIFFICULTIES.map((d) => (
                    <Button
                      key={d.name}
                      variant={
                        difficulties.includes(d.name) ? "secondary" : "outline"
                      }
                      onClick={() => toggle(d.name)}
                    >
                      <span className={d.color}>{d.name}</span>
                      <span className="text-muted-foreground">
                        {d.minutes}m
                      </span>
                    </Button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm">
                Language
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="rounded-md border bg-background px-2 py-1"
                >
                  <option value="python">Python</option>
                  <option value="javascript">JavaScript</option>
                  <option value="cpp">C++</option>
                  <option value="java">Java</option>
                </select>
              </div>
              <Button
                disabled={difficulties.length === 0}
                onClick={() => emit("duels:queue", difficulties)}
              >
                Find ranked match
              </Button>
              <Button
                variant="outline"
                disabled={difficulties.length === 0}
                onClick={() => emit("duels:invite", difficulties[0])}
              >
                Play a friend (casual, {difficulties[0] ?? "pick a difficulty"})
              </Button>
            </CardContent>
          </Card>
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
    );
  }

  // ---------- match ----------
  const diff = DIFFICULTIES.find((d) => d.name === match?.problem.difficulty);
  const won = end?.winner === me;
  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">{match?.problem.title}</h1>
          <span className={`text-sm ${diff?.color ?? ""}`}>
            {match?.problem.difficulty}
          </span>
          {!match?.ranked && (
            <span className="text-xs text-muted-foreground">casual</span>
          )}
        </div>
        <div className="flex items-center gap-6 text-sm">
          {match?.players.map((p) => {
            const t = tier(p.elo);
            return (
              <div key={p.uid} className="flex min-w-40 flex-col gap-1">
                <span>
                  {p.uid === me ? "You" : p.name}{" "}
                  <span className={t.color}>
                    {t.name} {p.elo}
                  </span>
                </span>
                <div className="h-1.5 rounded bg-muted">
                  <div
                    className="h-full rounded bg-primary transition-all"
                    style={{
                      width: `${(100 * p.passed) / (match?.total || 1)}%`,
                    }}
                  />
                </div>
                <span className="text-xs text-muted-foreground">
                  {p.passed}/{match?.total} tests · {p.submits} submits
                </span>
              </div>
            );
          })}
          <span className="font-mono text-lg">{clock(secs)}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={phase !== "match"}
            onClick={() => emit("duels:forfeit")}
          >
            Forfeit
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-2">
        <div className="overflow-auto rounded-md border p-4">
          <p className="whitespace-pre-wrap leading-relaxed">
            {match?.problem.description}
          </p>
          {match?.problem.samples.map((t, i) => (
            <div key={i} className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="text-muted-foreground">Input</p>
                <pre className="rounded bg-muted p-2 font-mono">{t.input}</pre>
              </div>
              <div>
                <p className="text-muted-foreground">Output</p>
                <pre className="rounded bg-muted p-2 font-mono">{t.output}</pre>
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
          <div className="min-h-0 flex-1 overflow-hidden rounded-md border">
            <Editor
              theme="vs-dark"
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
