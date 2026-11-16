# Flash — Codebase Guide

A walkthrough of how the project is put together, where things live, and a few
small first changes to try.

---

## 1. The big picture

Flash is a competitive flashcard app with three features:

1. **Battle rooms**: players race through a deck of multiple-choice questions in real time.
2. **DSA duels**: two players solve the same coding problem head-to-head. Code is run by Judge0.
3. **Leaderboard**: players are ranked by Elo, which comes from ranked duels.

```
 Browser (React + Vite)
     │  HTTP  /api/*            (REST: decks, leaderboard, /me)
     │  WS    /socket.io/*      (real-time: races + duels)
     ▼
 Caddy (frontend container)  ── serves the built React app, proxies /api and /socket.io
     ▼
 Backend (Fastify + Socket.IO, Node/TypeScript)
     ├── Postgres  (users, decks, cards, race_results, problems, matches)
     ├── Firebase Admin (verifies login tokens)
     └── Judge0 (sandboxed code runner for duels, with its own Postgres + Redis)
```

All of it runs from one `docker-compose.yml` on a single AWS EC2 instance.

---

## 2. Folder map

| Path | What it is |
|---|---|
| `backend/` | Fastify REST API and Socket.IO game servers |
| `frontend/` | React app (Vite, Tailwind, shadcn/ui components) |
| `scripts/import-problems.ts` | Builds `backend/problems.json` from DeepMind CodeContests |
| `infra/infra.yml` | CloudFormation template: EC2, S3 bucket, IAM roles |
| `.github/workflows/deploy.yml` | Deploys to AWS on every push to `main` |
| `docker-compose.yml` | Runs everything: db, backend, web (Caddy), judge0 + workers + db + redis |
| `judge0.conf` | Judge0 settings |
| `test/decks/` | Sample deck files (valid and invalid) for trying the upload page |
| `cf-ai/` | Prototype AI tutor (Cloudflare Worker). Only the compiled `public/app.js` is committed |

---

## 3. Backend (`backend/`)

### `server.ts`: entry point
- Builds the Fastify app (`buildApp()` from `app.ts`) and attaches a Socket.IO server to it.
- Registers the two real-time modules: `registerQuiz(io)` and `registerDuels(io)`.
- **Socket auth middleware** (`io.use`): every socket must send a Firebase ID token
  in `handshake.auth.token`. The user's `uid` and `name` are stored on `socket.data`.
- **Creates the database tables on startup** with `create table if not exists`:
  `users`, `decks`, `cards`, `race_results`, `problems`, `matches`.
- Upserts every problem from `problems.json` into the `problems` table.
- Listens on `PORT` (default 3000).

### `app.ts`: REST API, auth, and the DB pool
- `verifyToken` / `requireUser`: check the `Authorization: Bearer <token>` header with Firebase Admin.
- `pool`: the Postgres connection pool (`DATABASE_URL`).
- Routes:

| Method & path | What it does |
|---|---|
| `GET /api/health` | Pings the DB |
| `GET /api/me` | Creates or updates the logged-in user and returns `{uid, name, elo}` |
| `GET /api/decks` | Lists all decks with owner name and card count |
| `POST /api/decks` | Creates a deck and its cards in one SQL statement. Max 20 decks per user, 4–2000 cards, validated by a JSON schema |
| `GET /api/decks/:id/leaderboard` | Top 10 best race scores for a deck |
| `GET /api/leaderboard` | Top 50 players by Elo (ranked duels only) |

### `quiz.ts`: battle rooms (races)
One **room** per deck (`deck:<id>`). Rooms are kept **in memory** in a `Map`.

The room cycles through these phases:
```
lobby ──(2+ players, or "solo")──▶ countdown (10s) ──▶ race (max 180s) ──▶ lobby
```
- `loadQuestions` picks 10 random cards. If a card has no wrong answers of its own,
  three are borrowed from other cards' answers in the same deck.
- Each player moves through the questions **at their own pace**. The server tracks each
  player's `index`, `score` and `correct`.
- **Scoring**: a correct answer is worth 500 points, plus up to 500 more for speed
  (`QUESTION_MS = 15s`). A wrong answer gets 0.
- The race ends when every player is done or the time runs out. Results are then saved to `race_results`.
- If a player refreshes the page, they rejoin as the same player (looked up by `uid`).
  If they disconnect mid-race, they are marked `left` and their score stays on the board.
- Socket events: client → `join`, `solo`, `answer`. Server → `state`, `question`, `result`, `end`.

### `duels.ts`: 1v1 coding duels
- **Matchmaking**: either join a queue (`duels:queue`, filtered by difficulty) or
  create a private invite code (`duels:invite` / `duels:accept`). Invite matches are unranked.
- A random problem of the chosen difficulty is picked. The time limit is 15, 20 or 25 minutes
  for Easy, Medium or Hard.
- **Submissions**: the code is sent to Judge0 one test at a time (`runTests`) and stops at
  the first failure. If the failed test is a sample, the player sees the input and expected
  output. If it's a hidden test, they only see "Failed hidden test N".
  Languages: Python, JavaScript, C++, Java.
- **Ending**: the first player to pass every test wins. Otherwise the match ends on
  time, forfeit, or disconnect (there's a 20 second grace period to reconnect).
- **Elo**: standard formula with `K = 32`. It's zero-sum: whatever one player gains,
  the other loses. A draw counts as 0.5. Results are saved to `matches`.
- Socket events are prefixed `duels:` (`queue`, `invite`, `accept`, `submit`,
  `forfeit`, `resume`, `match`, `progress`, `result`, `end`, …).

### Database tables
```
users(uid, name, email, elo=1200)
decks(id, owner_uid → users, title, subject)
cards(id, deck_id → decks, prompt, answer, choices jsonb|null, image_url)
race_results(deck_id, uid, score, correct, total)
problems(slug, title, difficulty, description, samples, tests jsonb)
matches(id, problem_id, ranked, player_a, player_b, winner, elo_a, elo_b)
```

---

## 4. Frontend (`frontend/src/`)

| File | Role |
|---|---|
| `main.tsx` / `App.tsx` | Mounts the app. Routes: `/`, `/upload`, `/room/:deckId`, `/duels`, `/leaderboard` |
| `firebase.ts` | Firebase client config, `auth`, and a `useUser()` hook |
| `Nav.tsx` | Top bar. Calls `/api/me` to show your Elo and tier pill. Has the theme toggle |
| `Home.tsx` | Deck list from `/api/decks`, with search and subject filter |
| `Upload.tsx` | Upload a deck file or paste one. Shows a preview, validates it, and POSTs to `/api/decks` |
| `parseDeck.ts` | Reads `.json`, CSV, and Anki plain-text exports. A line is `front,back[,wrong1,wrong2,wrong3]` |
| `Room.tsx` | The race UI (Socket.IO). Number keys 1–4 answer. Sound and shake feedback. Shows a review of missed questions at the end |
| `Practice.tsx` | Simple flip-card review of the questions you missed after a race |
| `Duels.tsx` | Duel lobby, code editor, submit, and results |
| `Leaderboard.tsx` | Global Elo table |
| `lib/tier.ts` | Elo → tier (Bronze < 1100 ≤ Silver < 1250 ≤ Gold < 1400 ≤ Diamond < 1550 ≤ Master) |
| `lib/theme.ts` | `useTheme()` for dark/light mode, saved in `localStorage` |
| `components/ui/` | shadcn/ui building blocks (button, card, dialog, table, tabs, …) |

---

## 5. Infra and deploy

- **Caddy** (`frontend/Caddyfile`) serves the built React files. It sends `/api/*` and
  `/socket.io/*` to `backend:3000`, and every other path falls back to `index.html`.
  Set `SITE_ADDRESS` to a domain and Caddy gets HTTPS certificates automatically.
- **Deploy** (`deploy.yml`): on a push to `main`, GitHub Actions logs into AWS with OIDC
  (no stored keys). It runs `git archive` and uploads the tarball to S3, then uses
  **SSM** (no SSH) to tell the EC2 box to unpack it and run
  `docker compose up -d --build`.
- **`infra.yml`** creates the S3 bucket, the instance role, the deploy role, and the EC2 host.

## 6. Running locally
```bash
docker compose up --build       # everything, at http://localhost
# or run each part on its own:
cd backend  && npm i && npm run dev    # needs backend/.env with DATABASE_URL (and JUDGE0_URL for duels)
cd frontend && npm i && npm run dev    # Vite dev server
```

---

## 7. Small changes to try first

Each of these touches one file and takes less than 30 minutes.

1. **Keyboard shortcuts in Practice** (`frontend/src/Practice.tsx`). *Recommended first change.*
   Races already accept number keys 1–4, but in Practice you have to click.
   Add a `useEffect` with a `keydown` listener: Space flips the card, and Enter or →
   goes to the next card once it's flipped. It's self-contained, easy to test by hand,
   and matches the style of `Room.tsx`.
2. **A "Previous" button in Practice.** Same file. Show it when `i > 0`, and have it call
   `setI(i - 1)` and `setFlipped(false)`.
3. **Fair shuffle** (`backend/quiz.ts`, `shuffle`). Sorting by `Math.random()` is slightly
   biased. Replace it with a Fisher–Yates shuffle, which is about 5 lines.
4. **Move the Firebase project ID to an env variable** (`backend/app.ts:6`). Use
   `process.env.FIREBASE_PROJECT_ID ?? "flash-57b36"`.
5. **Delete `files.txt`.** It's a leftover list of files at the repo root.

## 8. Bigger ideas, for later
- Real **spaced repetition**. The README promises it, but it isn't built yet. It needs a `card_reviews` table and SM-2 or FSRS scheduling.
- Elo updates after races. The header comment in `quiz.ts` describes this, but it isn't implemented.
- Editing and deleting decks, and a "My decks" page.
- Proper database migrations instead of `create table if not exists` at startup.
- Rooms and matches live in memory, so a restart ends every live game.
- Tests: Vitest for `parseDeck.ts` using `test/decks/`, and `fastify.inject()` for the API.
