import { Server } from "socket.io";
import { buildApp, pool, verifyToken } from "./app.ts";
import { registerQuiz } from "./quiz.ts";

import { registerDuels } from "./duels.ts";
import problems from "./problems.json" with { type: "json" };

const fastify = buildApp();

const io = new Server(fastify.server);
registerQuiz(io);
registerDuels(io);

io.use(async (socket, next) => {
  try {
    const user = await verifyToken(socket.handshake.auth.token);
    socket.data.uid = user.uid;
    socket.data.name = user.name ?? "anon";
    next();
  } catch {
    next(new Error("Unauthorized"));
  }
});

io.on("connection", (socket) => socket.emit("hello", socket.id));

await pool.query(`
    create table if not exists users (
      uid text primary key,
      name text not null,
      email text,
      elo int not null default 1200,
      created_at timestamptz not null default now()
    )
  `);

await pool.query(` create table if not exists decks (
    id serial primary key,
    owner_uid text not null references users(uid),
    title text not null,
    subject text not null,
    created_at timestamptz not null default now()
    )`);
await pool.query(`  create table if not exists cards (
    id serial primary key,
    deck_id int not null references decks(id) on delete cascade,
    prompt text not null,
    answer text not null,
    choices jsonb,      -- 3 wrong answers, or null = flashcard
    image_url text
    )`);

await pool.query(`create table if not exists race_results (
    id serial primary key,
    deck_id int not null references decks(id) on delete cascade,
    uid text not null references users(uid),
    score int not null,
    correct int not null,
    total int not null,
    created_at timestamptz not null default now()
  )`);

await pool.query(`create table if not exists problems (
    id serial primary key,
    slug text unique not null,
    title text not null,
    difficulty text not null,
    description text not null,
    samples int not null,
    tests jsonb not null
  )`);
await pool.query(`create table if not exists matches (
    id text primary key,
    problem_id int references problems(id),
    ranked boolean not null,
    player_a text references users(uid),
    player_b text references users(uid),
    winner text,
    elo_a int,
    elo_b int,
    created_at timestamptz not null default now()
  )`);

await pool.query(
  `insert into problems (slug, title, difficulty, description, samples, tests)
     select * from jsonb_to_recordset($1::jsonb)
       as x(slug text, title text, difficulty text, description text, samples int, tests jsonb)
     on conflict (slug) do update set title = excluded.title, difficulty = excluded.difficulty,
       description = excluded.description, samples = excluded.samples, tests = excluded.tests`,
  [JSON.stringify(problems)],
);

fastify.listen(
  {
    host: "0.0.0.0",
    port: Number(process.env.PORT ?? 3000),
  },
  function (err, address) {
    if (err) {
      fastify.log.error(err);
      process.exit(1);
    }

    fastify.log.info("Server Running!");
  },
);
