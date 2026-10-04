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

  fastify.get<{ Params: { id: number } }>(
    "/api/decks/:id/leaderboard",
    {
      schema: {
        params: { type: "object", properties: { id: { type: "integer" } } },
      },
    },
    async (request) => {
      const { rows } = await pool.query(
        `select u.uid, u.name, max(r.score)::int as best, count(*)::int as games
             from race_results r join users u on u.uid = r.uid
             where r.deck_id = $1
             group by u.uid, u.name
             order by best desc
             limit 10`,
        [request.params.id],
      );
      return rows;
    },
  );

  fastify.get("/api/leaderboard", async () => {
    const { rows } = await pool.query(
      `select u.uid, u.name, u.elo,
                  count(m.id)::int as games,
                  count(m.id) filter (where m.winner = u.uid)::int as wins,
                  count(m.id) filter (where m.winner is not null and m.winner <> u.uid)::int as losses
           from users u
           join matches m on m.ranked and u.uid in (m.player_a, m.player_b)
           group by u.uid
           order by u.elo desc, wins desc
           limit 50`,
    );
    return rows;
  });

  const deckBody = {
    type: "object",
    required: ["title", "subject", "cards"],
    properties: {
      title: { type: "string", minLength: 1, maxLength: 100 },
      subject: { type: "string", minLength: 1, maxLength: 50 },
      cards: {
        type: "array",
        minItems: 4,
        maxItems: 2000,
        items: {
          type: "object",
          required: ["prompt", "answer"],
          properties: {
            prompt: { type: "string", minLength: 1, maxLength: 1000 },
            answer: { type: "string", minLength: 1, maxLength: 500 },
            choices: {
              type: "array",
              items: { type: "string", maxLength: 500 },
              minItems: 3,
              maxItems: 3,
            },
            imageUrl: { type: "string", pattern: "^https://", maxLength: 2000 },
          },
        },
      },
    },
  };

  type Card = {
    prompt: string;
    answer: string;
    choices?: string[];
    imageUrl?: string;
  };

  fastify.post<{ Body: { title: string; subject: string; cards: Card[] } }>(
    "/api/decks",
    { schema: { body: deckBody } },
    async (request) => {
      const user = await requireUser(request);
      const {
        rows: [{ n }],
      } = await pool.query(
        "select count(*)::int as n from decks where owner_uid = $1",
        [user.uid],
      );
      if (n >= 20)
        throw Object.assign(new Error("Deck limit reached"), {
          statusCode: 403,
        });

      const { title, subject, cards } = request.body;
      const { rows } = await pool.query(
        `with d as (
             insert into decks (owner_uid, title, subject) values ($1, $2, $3) returning id
           )
           insert into cards (deck_id, prompt, answer, choices, image_url)
           select d.id, x.prompt, x.answer, x.choices, x."imageUrl"
           from d, jsonb_to_recordset($4::jsonb)
             as x(prompt text, answer text, choices jsonb, "imageUrl" text)
           returning deck_id`,
        [user.uid, title, subject, JSON.stringify(cards)],
      );
      return { id: rows[0].deck_id };
    },
  );

  fastify.get("/api/decks", async () => {
    const { rows } = await pool.query(
      `select d.id, d.title, d.subject, u.name as owner, count(c.id)::int as cards
         from decks d join users u on u.uid = d.owner_uid
         left join cards c on c.deck_id = d.id
         group by d.id, u.name order by d.created_at desc`,
    );
    return rows;
  });

  return fastify;
};
