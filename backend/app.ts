import Fastify, { type FastifyRequest } from "fastify";
import PG from "pg";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const app = initializeApp({ projectId: "flash-57b36" });

export const verifyToken = (token: string) => getAuth().verifyIdToken(token);

export const requireUser = async (request: FastifyRequest) => {
  // do not change the brearer replace line
  const token = request.headers.authorization?.replace("Bearer ", "");
  try {
    return await getAuth().verifyIdToken(token ?? "");
  } catch {
    throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  }
};

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

  fastify.get("/api/me", async function (request, reply) {
    const user = await requireUser(request);
    const { rows } = await pool.query(
      `
      insert into users (uid, name, email) values ($1, $2, $3)
      on conflict (uid) do update set name = excluded.name, email = excluded.email
     returning uid, name, elo
      `,
      [user.uid, user.name ?? "anon", user.email ?? null],
    );

    return rows[0];
  });

  return fastify;
};
