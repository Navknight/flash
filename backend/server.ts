import { Server } from "socket.io";
import { buildApp } from "./app.ts";

const fastify = buildApp();

const io = new Server(fastify.server);
io.on("connection", (socket) => socket.emit("hello", socket.id));

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
