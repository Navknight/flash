// backend/raids.ts
// Boss Raid: cooperative study boss fight. Self-contained plug-in module.
// Lives in its own Socket.io namespace ("/raids") and its own "raid_*" tables.
// Node 22 type-stripping rules: no enums, no parameter properties, `import type` for types.

import { randomInt } from "node:crypto";
import type { Server } from "socket.io";

type Db = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }>;
};
type VerifyToken = (
  token: string,
) => Promise<{ uid: string; name?: string | null }>;
type Ack = (response: Record<string, unknown>) => void;

// Errors we are happy to show to the user. Anything else becomes a generic message.
class UserError extends Error {}

const ANSWER_WINDOW_SEC = 20; // time window for the speed bonus
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

type Runtime = {
  endsAt: number;
  timer: ReturnType<typeof setTimeout>;
  // question currently shown to each player, with the server-side send time
  pending: Map<string, { questionId: number; sentAt: number }>;
};
const runtimes = new Map<string, Runtime>();

// ---------------------------------------------------------------- tables

export async function setupRaidTables(db: Db) {
  await db.query(`create table if not exists raids (
    code text primary key,
    host_uid text not null references users(uid),
    title text not null,
    boss_name text not null,
    boss_max_hp int not null,
    duration_sec int not null,
    status text not null default 'lobby',
    created_at timestamptz not null default now(),
    started_at timestamptz,
    ended_at timestamptz
  )`);

  await db.query(`create table if not exists raid_questions (
    id serial primary key,
    raid_code text not null references raids(code) on delete cascade,
    position int not null,
    prompt text not null,
    choices jsonb not null,
    correct_index int not null,
    base_damage int not null default 100
  )`);

  await db.query(`create table if not exists raid_participants (
    raid_code text not null references raids(code) on delete cascade,
    uid text not null references users(uid),
    name text not null,
    joined_at timestamptz not null default now(),
    total_damage int not null default 0,
    correct int not null default 0,
    answered int not null default 0,
    primary key (raid_code, uid)
  )`);

  await db.query(`create table if not exists raid_answers (
    id serial primary key,
    raid_code text not null references raids(code) on delete cascade,
    uid text not null references users(uid),
    question_id int not null references raid_questions(id) on delete cascade,
    choice_index int not null,
    correct boolean not null,
    damage int not null default 0,
    answered_at timestamptz not null default now(),
    unique (raid_code, uid, question_id)
  )`);
}

// ---------------------------------------------------------------- helpers

const isInt = (v: unknown): v is number => Number.isInteger(v);
const isStr = (v: unknown, min: number, max: number): v is string =>
  typeof v === "string" && v.trim().length >= min && v.trim().length <= max;

function normCode(v: unknown): string {
  const code = String(v ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) throw new UserError("Invalid raid code");
  return code;
}

function newCode(): string {
  let s = "";
  for (let i = 0; i < 6; i++) s += CODE_CHARS[randomInt(CODE_CHARS.length)];
  return s;
}

function validateCreate(p: any) {
  if (!isStr(p?.title, 1, 80)) throw new UserError("Title must be 1-80 characters");
  if (!isStr(p?.bossName, 1, 60)) throw new UserError("Boss name must be 1-60 characters");
  if (!isInt(p?.bossHp) || p.bossHp < 100 || p.bossHp > 1_000_000)
    throw new UserError("Boss HP must be between 100 and 1,000,000");
  if (!isInt(p?.durationMin) || p.durationMin < 1 || p.durationMin > 1440)
    throw new UserError("Duration must be between 1 and 1440 minutes");
  if (!Array.isArray(p?.questions) || p.questions.length < 1 || p.questions.length > 50)
    throw new UserError("Add between 1 and 50 questions");

  const questions = p.questions.map((q: any, i: number) => {
    const n = i + 1;
    if (!isStr(q?.prompt, 1, 300)) throw new UserError(`Question ${n}: prompt must be 1-300 characters`);
    if (!Array.isArray(q?.choices) || q.choices.length < 2 || q.choices.length > 6)
      throw new UserError(`Question ${n}: needs 2-6 choices`);
    if (!q.choices.every((c: unknown) => isStr(c, 1, 120)))
      throw new UserError(`Question ${n}: each choice must be 1-120 characters`);
    if (!isInt(q.correctIndex) || q.correctIndex < 0 || q.correctIndex >= q.choices.length)
      throw new UserError(`Question ${n}: pick a valid correct answer`);
    const base = q.baseDamage ?? 100;
    if (!isInt(base) || base < 10 || base > 1000)
      throw new UserError(`Question ${n}: damage must be between 10 and 1000`);
    return {
      position: i,
      prompt: q.prompt.trim(),
      choices: q.choices.map((c: string) => c.trim()),
      correct_index: q.correctIndex,
      base_damage: base,
    };
  });

  return {
    title: p.title.trim() as string,
    bossName: p.bossName.trim() as string,
    bossHp: p.bossHp as number,
    durationSec: p.durationMin * 60,
    questions,
  };
}

// ---------------------------------------------------------------- module

export function registerRaids(io: Server, db: Db, verifyToken: VerifyToken) {
  const nsp = io.of("/raids");
  const room = (code: string) => `raid:${code}`;

  // The auth middleware in server.ts only covers the default namespace,
  // so this namespace needs its own.
  nsp.use(async (socket, next) => {
    try {
      const user = await verifyToken(socket.handshake.auth.token);
      socket.data.uid = user.uid;
      socket.data.name = user.name ?? "anon";
      // users rows are normally created by GET /api/me; make sure one exists so the
      // raid_* foreign keys can't fail. Never overwrites an existing row.
      await db.query(
        `insert into users (uid, name) values ($1, $2) on conflict (uid) do nothing`,
        [user.uid, socket.data.name],
      );
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });

  // Boss HP is always derived from what players have dealt (DB is the source of truth).
  async function hpOf(code: string): Promise<number> {
    const { rows } = await db.query(
      `select r.boss_max_hp - coalesce(sum(p.total_damage), 0) as hp
         from raids r left join raid_participants p on p.raid_code = r.code
        where r.code = $1 group by r.code`,
      [code],
    );
    return rows[0] ? Math.max(0, Number(rows[0].hp)) : 0;
  }

  async function leaderboard(code: string) {
    const { rows } = await db.query(
      `select uid, name, total_damage, correct, answered
         from raid_participants where raid_code = $1
        order by total_damage desc, joined_at`,
      [code],
    );
    return rows.map((r) => ({
      uid: r.uid as string,
      name: r.name as string,
      totalDamage: r.total_damage as number,
      correct: r.correct as number,
      answered: r.answered as number,
    }));
  }

  async function snapshot(code: string, uid: string) {
    const { rows } = await db.query(
      `select code, title, boss_name, boss_max_hp, duration_sec, status, host_uid,
              extract(epoch from started_at) * 1000 as started_ms,
              (select count(*)::int from raid_questions q where q.raid_code = raids.code) as question_count
         from raids where code = $1`,
      [code],
    );
    const raid = rows[0];
    if (!raid) throw new UserError("Raid not found");
    const players = await leaderboard(code);
    const dealt = players.reduce((sum, p) => sum + p.totalDamage, 0);
    return {
      code: raid.code as string,
      title: raid.title as string,
      bossName: raid.boss_name as string,
      bossMaxHp: raid.boss_max_hp as number,
      hpRemaining: Math.max(0, raid.boss_max_hp - dealt),
      status: raid.status as string,
      isHost: raid.host_uid === uid,
      endsAt: raid.started_ms ? Number(raid.started_ms) + raid.duration_sec * 1000 : null,
      questionCount: raid.question_count as number,
      players,
      me: players.find((p) => p.uid === uid) ?? null,
    };
  }

  // Safe to call more than once: only the first call flips the status.
  async function finishRaid(code: string, result: "won" | "lost") {
    const rt = runtimes.get(code);
    if (rt) {
      clearTimeout(rt.timer);
      runtimes.delete(code);
    }
    const { rows } = await db.query(
      `update raids set status = $2, ended_at = now()
        where code = $1 and status = 'active' returning code`,
      [code, result],
    );
    if (rows.length === 0) return;
    nsp.to(room(code)).emit("raid:ended", {
      result,
      leaderboard: await leaderboard(code),
    });
  }

  function armTimer(code: string, endsAt: number) {
    const timer = setTimeout(
      () => finishRaid(code, "lost").catch(console.error),
      Math.max(0, endsAt - Date.now()),
    );
    runtimes.set(code, { endsAt, timer, pending: new Map() });
  }

  // Server restarted mid-raid? Re-arm the timers (or finish raids that ran out meanwhile).
  db.query(
    `select code, duration_sec, extract(epoch from started_at) * 1000 as started_ms
       from raids where status = 'active'`,
  )
    .then(async ({ rows }) => {
      for (const r of rows) {
        const endsAt = Number(r.started_ms) + r.duration_sec * 1000;
        if ((await hpOf(r.code)) <= 0) await finishRaid(r.code, "won");
        else if (endsAt <= Date.now()) await finishRaid(r.code, "lost");
        else armTimer(r.code, endsAt);
      }
    })
    .catch((e) => console.error("[raids] recovery failed", e));

  nsp.on("connection", (socket) => {
    const uid: string = socket.data.uid;
    const name: string = socket.data.name;

    // Wraps a handler: runs it, sends { ok: true, ... } or { ok: false, error } to the ack callback.
    const handle =
      (fn: (payload: any) => Promise<Record<string, unknown>>) =>
      async (payload: any, ack?: Ack) => {
        const reply = typeof ack === "function" ? ack : () => {};
        try {
          reply({ ok: true, ...(await fn(payload)) });
        } catch (e) {
          if (!(e instanceof UserError)) console.error("[raids]", e);
          reply({
            ok: false,
            error: e instanceof UserError ? e.message : "Something went wrong",
          });
        }
      };

    socket.on(
      "raid:create",
      handle(async (p) => {
        const v = validateCreate(p);

        let code = "";
        for (let i = 0; i < 5 && !code; i++) {
          const candidate = newCode();
          const { rows } = await db.query(
            `insert into raids (code, host_uid, title, boss_name, boss_max_hp, duration_sec)
             values ($1, $2, $3, $4, $5, $6)
             on conflict (code) do nothing returning code`,
            [candidate, uid, v.title, v.bossName, v.bossHp, v.durationSec],
          );
          if (rows.length) code = candidate;
        }
        if (!code) throw new Error("Could not generate a raid code");

        try {
          await db.query(
            `insert into raid_questions (raid_code, position, prompt, choices, correct_index, base_damage)
             select $1, x.position, x.prompt, x.choices, x.correct_index, x.base_damage
               from jsonb_to_recordset($2::jsonb)
                 as x(position int, prompt text, choices jsonb, correct_index int, base_damage int)`,
            [code, JSON.stringify(v.questions)],
          );
          await db.query(
            `insert into raid_participants (raid_code, uid, name) values ($1, $2, $3)`,
            [code, uid, name],
          );
        } catch (e) {
          await db.query(`delete from raids where code = $1`, [code]); // no half-made raids
          throw e;
        }

        await socket.join(room(code));
        return { code };
      }),
    );

    socket.on(
      "raid:join",
      handle(async (p) => {
        const code = normCode(p?.code);
        const { rows } = await db.query(`select status from raids where code = $1`, [code]);
        if (!rows[0]) throw new UserError("Raid not found");

        // Finished raids are view-only: no joining, just the final snapshot.
        if (rows[0].status === "lobby" || rows[0].status === "active") {
          const ins = await db.query(
            `insert into raid_participants (raid_code, uid, name) values ($1, $2, $3)
             on conflict (raid_code, uid) do nothing returning uid`,
            [code, uid, name],
          );
          await socket.join(room(code));
          if (ins.rows.length) socket.to(room(code)).emit("raid:player-joined", { uid, name });
        }
        return { state: await snapshot(code, uid) };
      }),
    );

    socket.on(
      "raid:leave",
      handle(async (p) => {
        await socket.leave(room(normCode(p?.code)));
        return {};
      }),
    );

    socket.on(
      "raid:start",
      handle(async (p) => {
        const code = normCode(p?.code);
        const { rows } = await db.query(
          `update raids set status = 'active', started_at = now()
            where code = $1 and host_uid = $2 and status = 'lobby'
            returning duration_sec`,
          [code, uid],
        );
        if (!rows.length)
          throw new UserError("Only the host can start a raid that is still in the lobby");
        const endsAt = Date.now() + rows[0].duration_sec * 1000;
        armTimer(code, endsAt);
        nsp.to(room(code)).emit("raid:started", { endsAt });
        return { endsAt };
      }),
    );

    socket.on(
      "raid:next",
      handle(async (p) => {
        const code = normCode(p?.code);
        const rt = runtimes.get(code);
        if (!rt || Date.now() >= rt.endsAt) throw new UserError("This raid is not active");

        const member = await db.query(
          `select 1 from raid_participants where raid_code = $1 and uid = $2`,
          [code, uid],
        );
        if (!member.rows.length) throw new UserError("Join the raid first");

        // If a question is already open (e.g. page refresh), resend it so the timer can't be reset.
        let q: any;
        const open = rt.pending.get(uid);
        if (open) {
          q = (
            await db.query(`select id, prompt, choices from raid_questions where id = $1`, [open.questionId])
          ).rows[0];
        }
        if (!q) {
          // Next unanswered question, in a stable per-player shuffled order.
          q = (
            await db.query(
              `select q.id, q.prompt, q.choices from raid_questions q
                where q.raid_code = $1
                  and not exists (
                    select 1 from raid_answers a
                     where a.raid_code = q.raid_code and a.uid = $2 and a.question_id = q.id)
                order by md5(q.id::text || $2) limit 1`,
              [code, uid],
            )
          ).rows[0];
          if (!q) return { done: true };
          rt.pending.set(uid, { questionId: q.id, sentAt: Date.now() });
        }
        return {
          done: false,
          question: { id: q.id, prompt: q.prompt, choices: q.choices },
          secondsAllowed: ANSWER_WINDOW_SEC,
        };
      }),
    );

    socket.on(
      "raid:answer",
      handle(async (p) => {
        const code = normCode(p?.code);
        const rt = runtimes.get(code);
        if (!rt || Date.now() >= rt.endsAt) throw new UserError("This raid is not active");

        const open = rt.pending.get(uid);
        if (!open || open.questionId !== p?.questionId)
          throw new UserError("Request a question first");
        if (!isInt(p?.choiceIndex)) throw new UserError("Invalid choice");
        rt.pending.delete(uid); // one attempt only, also blocks double-submits

        const q = (
          await db.query(
            `select choices, correct_index, base_damage from raid_questions
              where id = $1 and raid_code = $2`,
            [open.questionId, code],
          )
        ).rows[0];
        if (!q || p.choiceIndex < 0 || p.choiceIndex >= q.choices.length)
          throw new UserError("Invalid choice");

        // Damage is computed on the server, from server-measured time.
        const correct = p.choiceIndex === q.correct_index;
        const elapsedSec = (Date.now() - open.sentAt) / 1000;
        const speed = Math.max(0, 1 - elapsedSec / ANSWER_WINDOW_SEC);
        const damage = correct ? Math.round(q.base_damage * (1 + 0.5 * speed)) : 0;

        const ins = await db.query(
          `insert into raid_answers (raid_code, uid, question_id, choice_index, correct, damage)
           values ($1, $2, $3, $4, $5, $6)
           on conflict (raid_code, uid, question_id) do nothing returning id`,
          [code, uid, open.questionId, p.choiceIndex, correct, damage],
        );
        if (!ins.rows.length) throw new UserError("You already answered that question");

        await db.query(
          `update raid_participants
              set total_damage = total_damage + $3, correct = correct + $4, answered = answered + 1
            where raid_code = $1 and uid = $2`,
          [code, uid, damage, correct ? 1 : 0],
        );

        const hpRemaining = await hpOf(code);
        nsp.to(room(code)).emit("raid:damage", { uid, name, damage, correct, hpRemaining });
        if (hpRemaining <= 0) await finishRaid(code, "won");

        return { correct, damage, correctIndex: q.correct_index, hpRemaining };
      }),
    );
  });
}