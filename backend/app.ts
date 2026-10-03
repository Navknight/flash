import Fastify from "fastify";
import PG from "pg";

export const pool = new PG.Pool({
  connectionString: process.env.DATABASE_URL,
});

export const buildApp = () => {
  const fastify = Fastify({
    logger: true,
  });

  fastify.get("/api/health", async function (request, reply) {
    await pool.query("SELECT 1");
    reply.send({
      ok: true,
    });
  });

  return fastify;
};
