import { Server } from "socket.io";
import { buildApp, pool, verifyToken } from "./app.ts";

const fastify = buildApp();

const io = new Server(fastify.server);

io.use(async (socket, next) => {
  try {
    const user = await verifyToken(socket.handshake.auth.token);
    socket.data.uid = user.uid;
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
