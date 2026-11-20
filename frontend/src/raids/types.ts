export type Player = {
  uid: string;
  name: string;
  totalDamage: number;
  correct: number;
  answered: number;
};

export type RaidStatus = "lobby" | "active" | "won" | "lost";

export type BossModel = "dragon" | "orc" | "zombie";

export type RaidState = {
  code: string;
  title: string;
  bossName: string;
  bossModel: BossModel;
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
  bossModel: BossModel;
  bossHp: number;
  durationMin: number;
  questions: NewQuestion[];
};

// one row of the "my raids" history list
export type RaidSummary = {
  code: string;
  title: string;
  bossName: string;
  bossModel: BossModel;
  status: RaidStatus;
  createdAt: string; // ISO date
  totalDamage: number;
  correct: number;
  answered: number;
  questionCount: number;
};

// a deck as listed by GET /api/decks
export type DeckInfo = {
  id: number;
  title: string;
  subject: string;
  owner: string;
  cards: number;
};