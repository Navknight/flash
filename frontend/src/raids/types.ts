export type Player = {
  uid: string;
  name: string;
  totalDamage: number;
  correct: number;
  answered: number;
};

export type RaidStatus = "lobby" | "active" | "won" | "lost";

export type RaidState = {
  code: string;
  title: string;
  bossName: string;
  bossMaxHp: number;
  hpRemaining: number;
  status: RaidStatus;
  isHost: boolean;
  endsAt: number | null; // epoch ms, null until the raid starts
  questionCount: number;
  players: Player[];
};

export type Question = { id: number; prompt: string; choices: string[] };

export type NextResult = {
  done: boolean;
  question?: Question;
  secondsAllowed?: number;
};

export type AnswerResult = {
  correct: boolean;
  damage: number;
  correctIndex: number;
  hpRemaining: number;
};

export type FeedItem = {
  id: number;
  uid: string;
  name: string;
  damage: number;
  correct: boolean;
};

export type EndInfo = { result: "won" | "lost"; leaderboard: Player[] };

export type NewQuestion = {
  prompt: string;
  choices: string[];
  correctIndex: number;
  baseDamage?: number;
};

export type CreateInput = {
  title: string;
  bossName: string;
  bossHp: number;
  durationMin: number;
  questions: NewQuestion[];
};