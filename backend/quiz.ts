/*
The quiz will work as follow ->
We have a few states -> lobby, countdonn, race, end, everyone finishes, lobby

Each player enters the lobby
The countdown starts as soon as there are >= 1 players in the lobby
The countdown resets if more players join the lobby

Each players independantly finishes the "race", i.e each player independentaly
goes through all the questions and finishes the quiz

They get their scores in the end

Once all the players finish the race, they get their elo updates based on their score, the average elo of the contest and the average score.
*/

import type { Server } from "socket.io";
import { pool } from "./app.ts";

const MIN_PLAYERS = 2;
const COUNTDOWN_MS = 10_000;
const RACE_MS = 180_000;
const QUESTION_MS = 15_000; // speed bonus scale per question
const FEEDBACK_MS = 800; // pause on right/wrong before the next question
const ROUND_SIZE = 10;

type Question = {
  prompt: string;
  answer: string;
  options: string[];
  imageUrl: string | null;
};
type Player = {
  name: string;
  socketId: string;
  racing: boolean; // false = joined mid-race, watching
  index: number; // next question for this player
  score: number;
  correct: number;
  askedAt: number;
  done: boolean;
  left: boolean; // disconnected mid-race; kept so their score stays in the standings
};
type Room = {
  phase: "lobby" | "countdown" | "race";
  players: Map<string, Player>;
  questions: Question[];
  deadline: number; // end of countdown or end of race
  timer?: NodeJS.Timeout;
};

const rooms = new Map<string, Room>();

function shuffle<T>(a: T[]): T[] {
  return a
    .map((v) => [Math.random(), v] as const)
    .sort((x, y) => x[0] - y[0])
    .map(([, v]) => v);
}

async function loadQuestions(deckId: number): Promise<Question[]> {
  const { rows } = await pool.query(
    "select prompt, answer, choices, image_url from cards where deck_id = $1",
    [deckId],
  );
  const answers = [...new Set(rows.map((r) => r.answer as string))];
  return shuffle(rows)
    .slice(0, ROUND_SIZE)
    .map((r) => {
      const wrong: string[] =
        r.choices ?? shuffle(answers.filter((a) => a !== r.answer)).slice(0, 3);
      return {
        prompt: r.prompt,
        answer: r.answer,
        imageUrl: r.image_url,
        options: shuffle([r.answer, ...wrong]),
      };
    });
}

function snapshot(room: Room) {
  return {
    phase: room.phase,
    msLeft: Math.max(0, room.deadline - Date.now()),
    total: room.questions.length,
    players: [...room.players]
      .map(([uid, p]) => ({
        uid,
        name: p.name,
        racing: p.racing,
        progress: p.index,
        score: p.score,
        correct: p.correct,
        done: p.done,
      }))
      .sort((a, b) => b.score - a.score),
  };
}

const allDone = (room: Room) =>
  [...room.players.values()].every((p) => !p.racing || p.done || p.left);

export function registerQuiz(io: Server) {
  const broadcast = (id: string, room: Room) =>
    io.to(id).emit("state", snapshot(room));

  const ask = (room: Room, p: Player) => {
    const q = room.questions[p.index];
    io.to(p.socketId).emit("question", {
      index: p.index,
      prompt: q.prompt,
      options: q.options,
      imageUrl: q.imageUrl,
    });
  };

  const maybeCountdown = (id: string, room: Room) => {
    const present = [...room.players.values()].filter((p) => !p.left).length;
    if (room.phase === "lobby" && present >= MIN_PLAYERS) {
      room.phase = "countdown";
      room.deadline = Date.now() + COUNTDOWN_MS;
      room.timer = setTimeout(() => startRace(id), COUNTDOWN_MS);
    } else if (room.phase === "countdown" && present < MIN_PLAYERS) {
      clearTimeout(room.timer);
      room.phase = "lobby";
    }
    broadcast(id, room);
  };

  const startRace = async (id: string) => {
    const room = rooms.get(id);
    if (!room || room.phase !== "countdown") return;
    room.questions = await loadQuestions(Number(id.split(":")[1]));
    if (room.phase !== "countdown") return; // someone left during the DB call and cancelled it
    room.phase = "race";
    room.deadline = Date.now() + RACE_MS;
    for (const p of room.players.values()) {
      Object.assign(p, {
        racing: true,
        index: 0,
        score: 0,
        correct: 0,
        done: false,
        askedAt: Date.now(),
      });
      ask(room, p);
    }
    room.timer = setTimeout(() => endRace(id), RACE_MS);
    broadcast(id, room);
  };

  const endRace = (id: string) => {
    const room = rooms.get(id);
    if (!room || room.phase !== "race") return;
    clearTimeout(room.timer);
    io.to(id).emit(
      "end",
      snapshot(room).players.filter((p) => p.racing),
    );
    const racers = snapshot(room).players.filter((p) => p.racing);
    pool
      .query(
        `insert into race_results (deck_id, uid, score, correct, total)
             select $1, x.uid, x.score, x.correct, $5
             from unnest($2::text[], $3::int[], $4::int[]) as x(uid, score, correct)`,
        [
          Number(id.split(":")[1]),
          racers.map((p) => p.uid),
          racers.map((p) => p.score),
          racers.map((p) => p.correct),
          room.questions.length,
        ],
      )
      .catch((err) => console.error("saving race results failed", err));
    for (const [uid, p] of room.players) {
      if (p.left) room.players.delete(uid);
      else p.racing = false;
    }
    room.phase = "lobby";
    if (room.players.size === 0) rooms.delete(id);
    else maybeCountdown(id, room);
  };

  io.on("connection", (socket) => {
    const uid: string = socket.data.uid;
    let id = "";

    socket.on("join", (deckId: number) => {
      id = `deck:${Number(deckId)}`;
      socket.join(id);
      const room: Room = rooms.get(id) ?? {
        phase: "lobby",
        players: new Map(),
        questions: [],
        deadline: 0,
      };
      rooms.set(id, room);
      const existing = room.players.get(uid);
      if (existing) {
        existing.socketId = socket.id; // page refresh: same player, new connection
        existing.left = false;
      } else {
        room.players.set(uid, {
          name: socket.data.name,
          socketId: socket.id,
          racing: false,
          index: 0,
          score: 0,
          correct: 0,
          askedAt: 0,
          done: false,
          left: false,
        });
      }
      maybeCountdown(id, room);
      const p = room.players.get(uid)!;
      if (room.phase === "race" && p.racing && !p.done) ask(room, p); // resume after refresh
    });
    socket.on("solo", () => {
      const room = rooms.get(id);
      if (!room || room.phase !== "lobby") return; // 2+ players means a countdown is already running
      room.phase = "countdown";
      startRace(id); // starts immediately
    });
    socket.on(
      "answer",
      ({ index, option }: { index: number; option: string }) => {
        const room = rooms.get(id);
        const p = room?.players.get(uid);
        if (
          !room ||
          !p ||
          room.phase !== "race" ||
          !p.racing ||
          p.done ||
          index !== p.index
        )
          return;
        const q = room.questions[index];
        const correct = option === q.answer;
        if (correct) {
          p.correct++;
          p.score += Math.round(
            500 +
              (500 * Math.max(0, QUESTION_MS - (Date.now() - p.askedAt))) /
                QUESTION_MS,
          );
        }
        socket.emit("result", { correct, answer: q.answer });
        p.index++;
        if (p.index >= room.questions.length) {
          p.done = true;
        } else {
          p.askedAt = Date.now() + FEEDBACK_MS;
          setTimeout(() => room.phase === "race" && ask(room, p), FEEDBACK_MS);
        }
        broadcast(id, room);
        if (allDone(room)) endRace(id);
      },
    );

    socket.on("disconnect", () => {
      const room = rooms.get(id);
      const p = room?.players.get(uid);
      if (!room || !p || p.socketId !== socket.id) return; // an older tab closed; ignore
      if (room.phase === "race" && p.racing) {
        p.left = true;
        if (allDone(room)) endRace(id);
        else broadcast(id, room);
      } else {
        room.players.delete(uid);
        if (room.players.size === 0) {
          clearTimeout(room.timer);
          rooms.delete(id);
        } else {
          maybeCountdown(id, room);
        }
      }
    });
  });
}
