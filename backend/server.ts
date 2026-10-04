import { Server } from "socket.io";
import { buildApp, pool, verifyToken } from "./app.ts";
import { registerQuiz } from "./quiz.ts";

const fastify = buildApp();

const io = new Server(fastify.server);
registerQuiz(io);

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
