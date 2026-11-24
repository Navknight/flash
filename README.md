# Flash

[Why Lines of Code is a meaningless metric](https://desunit.com/blog/why-lines-of-code-are-a-meaningless-productivity-metric)

Flash is a fun way to learn. It builds on top of the idea of spaced repetition and allows students to learn through competition (friendly competition of course, totally friendly hehe).

There are 4 main features -

1. Battle rooms, where students can compete on different topics and even make their own battle rooms
2. DSA battles, cause why not
3. Boss raids, where a whole group fights one boss together
4. Leaderboard (_friendly_)

The Flash website is built using React with the backend running in fastify (to keep both components in a single language to reduce overhead). The backend is hosted on AWS using the free credits given to a new account.

Duel problems come from DeepMind CodeContests (Codeforces problems), licensed CC BY 4.0.

## Run locally

Needs Docker.

```
git clone https://github.com/Navknight/flash.git
cd flash
docker compose up --build
```

Open http://localhost and sign in with Google. Code duels need Judge0, which only runs on Linux with cgroup v1.

For live reload while coding:

```
docker run -d -p 5432:5432 -e POSTGRES_USER=flash -e POSTGRES_PASSWORD=flash -e POSTGRES_DB=flash postgres:16-alpine
echo "DATABASE_URL=postgres://flash:flash@localhost:5432/flash" > backend/.env
cd backend && npm install && npm run dev
cd frontend && npm install && npm run dev
```

Run the last two in separate terminals, then open http://localhost:5173.

## Code

- `backend/server.ts`: starts the server, checks logins, creates tables, plugs in each game mode
- `backend/app.ts`: REST API and database connection
- `backend/quiz.ts`: quiz races
- `backend/duels.ts`: code duels, matchmaking and Elo
- `backend/raids.ts`, `raidLogic.ts`: boss raids and their rules
- `backend/problems.json`: duel problems and tests
- `frontend/src/`: one file per page (`Home`, `Upload`, `Room`, `Duels`, `Leaderboard`, `Profile`, `BossRaid`), shared bits in `components/` and `lib/`
- `frontend/Caddyfile`: serves the site, sends `/api` and `/socket.io` to the backend
- `infra/infra.yml`: AWS server setup
- `.github/workflows/deploy.yml`: deploys on every push to `main`
- `scripts/import-problems.ts`: builds `problems.json`
- `test/decks/`: sample decks for testing upload
