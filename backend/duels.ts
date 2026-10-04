import type { Server, Socket } from "socket.io";
import { pool } from "./app.ts";

const JUDGE0 = process.env.JUDGE0_URL ?? "http://localhost:2358";
const MINUTES: Record<string, number> = { Easy: 15, Medium: 20, Hard: 25 };
const GRACE_MS = 20_000;
const K = 32; // Elo K-factor: max rating change per match
const LANGUAGES = new Map([
  ["python", 71],
  ["javascript", 63],
  ["cpp", 54],
  ["java", 62],
]);

type Test = { input: string; output: string };
type Problem = {
  id: number;
  title: string;
  difficulty: string;
  description: string;
  samples: number;
  tests: Test[];
};
type Seeker = {
  uid: string;
  name: string;
  elo: number;
  difficulties: string[];
  socket: Socket;
  since: number;
};
type Attempt = {
  uid: string;
  passed: number;
  total: number;
  verdict: string;
  at: number;
};
type Match = {
  id: string;
  problem: Problem;
  ranked: boolean;
  players: string[];
  names: Record<string, string>;
  elos: Record<string, number>;
  passed: Record<string, number>;
  submits: Record<string, number>;
  attempts: Attempt[];
  code: Record<string, string>; // last submitted code, revealed at the end
  busy: Set<string>;
  startedAt: number;
  endsAt: number;
  timer?: NodeJS.Timeout;
  grace: Record<string, NodeJS.Timeout>;
  over: boolean;
};

let queue: Seeker[] = [];
const invites = new Map<string, Seeker>();
const matches = new Map<string, Match>();
const matchOf = new Map<string, string>();

const expected = (a: number, b: number) => 1 / (1 + 10 ** ((b - a) / 400));
// ±100 Elo, widening by 50 for every 10 s spent waiting, so nobody waits forever
const ratingWindow = (s: Seeker) =>
  100 + 50 * Math.floor((Date.now() - s.since) / 10_000);
const validDifficulties = (d: unknown): d is string[] =>
  Array.isArray(d) &&
  d.length > 0 &&
  d.every((x) => typeof x === "string" && Object.hasOwn(MINUTES, x));
const clean = (s: string | null) =>
  (s ?? "").replace(/[ \t]+$/gm, "").trimEnd();

async function judge(code: string, languageId: number, test: Test) {
  const res = await fetch(
    `${JUDGE0}/submissions?base64_encoded=false&wait=true`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source_code: code,
        language_id: languageId,
        stdin: test.input,
        cpu_time_limit: 2,
      }),
    },
  );
  if (!res.ok) throw new Error(`judge0 ${res.status}`);
  return (await res.json()) as {
    stdout: string | null;
    stderr: string | null;
    compile_output: string | null;
    status: { id: number; description: string };
  };
}

async function runTests(problem: Problem, languageId: number, code: string) {
  const anyCase = /in (any|arbitrary) case/i.test(problem.description);
  const same = (got: string | null, want: string) =>
    anyCase
      ? clean(got).toLowerCase() === clean(want).toLowerCase()
      : clean(got) === clean(want);
  const total = problem.tests.length;
  for (let i = 0; i < total; i++) {
    const t = problem.tests[i];
    const r = await judge(code, languageId, t);
    if (r.status.id === 3 && same(r.stdout, t.output)) continue;
    const shown = i < problem.samples;
    return {
      passed: i,
      total,
      verdict: r.status.id === 3 ? "Wrong Answer" : r.status.description,
      detail:
        r.compile_output ??
        (shown
          ? `Input:\n${t.input}\nExpected:\n${t.output}\nGot:\n${r.stdout ?? ""}${r.stderr ? `\n${r.stderr}` : ""}`
          : `Failed hidden test ${i + 1}`),
    };
  }
  return { passed: total, total, verdict: "Accepted", detail: "" };
}

export function registerDuels(io: Server) {
  const room = (m: Match) => `match:${m.id}`;

  const snapshot = (m: Match) => ({
    matchId: m.id,
    ranked: m.ranked,
    msLeft: Math.max(0, m.endsAt - Date.now()),
    total: m.problem.tests.length,
    problem: {
      title: m.problem.title,
      difficulty: m.problem.difficulty,
      description: m.problem.description,
      samples: m.problem.tests.slice(0, m.problem.samples),
    },
    players: m.players.map((uid) => ({
      uid,
      name: m.names[uid],
      elo: m.elos[uid],
      passed: m.passed[uid],
      submits: m.submits[uid],
    })),
  });

  const finish = async (m: Match, winner: string | null, reason: string) => {
    if (m.over) return;
    m.over = true;
    clearTimeout(m.timer);
    Object.values(m.grace).forEach(clearTimeout);
    m.players.forEach((uid) => matchOf.delete(uid));
    matches.delete(m.id);

    const [a, b] = m.players;
    const delta: Record<string, number> = { [a]: 0, [b]: 0 };
    if (m.ranked) {
      const score = winner === a ? 1 : winner === b ? 0 : 0.5; // draw = half a win
      const d = Math.round(K * (score - expected(m.elos[a], m.elos[b])));
      delta[a] = d;
      delta[b] = -d; // zero-sum: what one gains the other loses
      await pool.query(
        "update users set elo = elo + case uid when $1 then $3::int else $4::int end where uid in ($1, $2)",
        [a, b, delta[a], delta[b]],
      );
    }
    await pool.query(
      `insert into matches (id, problem_id, ranked, player_a, player_b, winner, elo_a, elo_b)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        m.id,
        m.problem.id,
        m.ranked,
        a,
        b,
        winner,
        m.ranked ? delta[a] : null,
        m.ranked ? delta[b] : null,
      ],
    );
    io.to(room(m)).emit("duels:end", {
      winner,
      reason,
      ranked: m.ranked,
      delta,
      names: m.names,
      attempts: m.attempts,
      code: m.code,
    });
  };

  const start = async (
    a: Seeker,
    b: Seeker,
    ranked: boolean,
    difficulties: string[],
  ) => {
    const {
      rows: [problem],
    } = await pool.query(
      "select * from problems where difficulty = any($1) order by random() limit 1",
      [difficulties],
    );
    if (!problem) {
      a.socket.emit("duels:error", "No problems for that difficulty yet");
      b.socket.emit("duels:error", "No problems for that difficulty yet");
      return;
    }
    const now = Date.now();
    const m: Match = {
      id: crypto.randomUUID(),
      problem,
      ranked,
      players: [a.uid, b.uid],
      names: { [a.uid]: a.name, [b.uid]: b.name },
      elos: { [a.uid]: a.elo, [b.uid]: b.elo },
      passed: { [a.uid]: 0, [b.uid]: 0 },
      submits: { [a.uid]: 0, [b.uid]: 0 },
      attempts: [],
      code: {},
      busy: new Set(),
      startedAt: now,
      endsAt: now + MINUTES[problem.difficulty] * 60_000,
      grace: {},
      over: false,
    };
    matches.set(m.id, m);
    matchOf.set(a.uid, m.id);
    matchOf.set(b.uid, m.id);
    a.socket.join(room(m));
    b.socket.join(room(m));
    m.timer = setTimeout(() => finish(m, null, "time"), m.endsAt - now);
    io.to(room(m)).emit("duels:match", snapshot(m));
  };

  const tryMatch = () => {
    queue = queue.filter((s) => s.socket.connected);
    for (const a of queue) {
      for (const b of queue) {
        if (a.uid === b.uid) continue;
        const shared = a.difficulties.filter((d) => b.difficulties.includes(d));
        if (
          shared.length &&
          Math.abs(a.elo - b.elo) <= Math.max(ratingWindow(a), ratingWindow(b))
        ) {
          queue = queue.filter((s) => s !== a && s !== b);
          start(a, b, true, shared);
          return tryMatch(); // there may be more pairs
        }
      }
    }
  };
  setInterval(tryMatch, 5000); // re-check as rating windows widen

  io.on("connection", (socket) => {
    const uid: string = socket.data.uid;
    const name: string = socket.data.name;
    const current = () => matches.get(matchOf.get(uid) ?? "");
    const seeker = async (difficulties: string[]): Promise<Seeker> => {
      const {
        rows: [u],
      } = await pool.query("select elo from users where uid = $1", [uid]);
      return {
        uid,
        name,
        elo: u?.elo ?? 1200,
        difficulties,
        socket,
        since: Date.now(),
      };
    };
    const leaveQueue = () => {
      queue = queue.filter((s) => s.uid !== uid);
      for (const [code, s] of invites) if (s.uid === uid) invites.delete(code);
    };

    socket.on("duels:resume", () => {
      const m = current();
      if (!m) return socket.emit("duels:idle");
      clearTimeout(m.grace[uid]);
      delete m.grace[uid];
      socket.join(room(m));
      socket.emit("duels:match", snapshot(m));
    });

    socket.on("duels:queue", async (difficulties: unknown) => {
      if (current() || !validDifficulties(difficulties)) return;
      leaveQueue();
      const me = await seeker(difficulties);
      if (!socket.connected || current()) return; // left or got matched while we waited
      queue.push(me);
      socket.emit("duels:queued");
      tryMatch();
    });

    socket.on("duels:invite", async (difficulty: unknown) => {
      if (current() || !validDifficulties([difficulty])) return;
      leaveQueue();
      const code = crypto.randomUUID().slice(0, 8);
      invites.set(code, await seeker([difficulty as string]));
      socket.emit("duels:invite", code);
    });

    socket.on("duels:accept", async (code: string) => {
      const host = invites.get(code);
      if (!host || host.uid === uid || !host.socket.connected || current()) {
        return socket.emit("duels:error", "This invite has expired");
      }
      invites.delete(code);
      start(host, await seeker(host.difficulties), false, host.difficulties);
    });

    socket.on("duels:cancel", leaveQueue);

    socket.on("duels:forfeit", () => {
      const m = current();
      if (m)
        finish(
          m,
          m.players.find((p) => p !== uid)!,
          "forfeit",
        );
    });

    socket.on(
      "duels:submit",
      async ({ language, code }: { language: string; code: string }) => {
        const m = current();
        const languageId = LANGUAGES.get(language);
        if (
          !m ||
          m.over ||
          !languageId ||
          m.busy.has(uid) ||
          typeof code !== "string" ||
          code.length > 50_000
        )
          return;
        m.busy.add(uid);
        m.submits[uid]++;
        m.code[uid] = code;
        try {
          const result = await runTests(m.problem, languageId, code);
          socket.emit("duels:result", result);
          m.attempts.push({
            uid,
            passed: result.passed,
            total: result.total,
            verdict: result.verdict,
            at: Date.now() - m.startedAt,
          });
          m.passed[uid] = Math.max(m.passed[uid], result.passed);
          io.to(room(m)).emit("duels:progress", snapshot(m).players);
          if (result.passed === result.total) await finish(m, uid, "solved");
        } catch {
          socket.emit("duels:result", {
            passed: 0,
            total: m.problem.tests.length,
            verdict: "Judge unavailable",
            detail: "Try again in a moment.",
          });
        } finally {
          m.busy.delete(uid);
        }
      },
    );

    socket.on("disconnecting", () => {
      leaveQueue();
      const m = current();
      if (!m || !socket.rooms.has(room(m))) return;
      m.grace[uid] = setTimeout(
        () =>
          finish(
            m,
            m.players.find((p) => p !== uid)!,
            "forfeit",
          ),
        GRACE_MS,
      );
    });
  });
}
