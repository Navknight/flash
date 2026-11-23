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
  badges: RaidBadge[]; // loot of a won raid (empty while it is still running)
};

export type Question = { id: number; prompt: string; choices: string[] };

export type NextResult = {
  done: boolean;
  question?: Question;
  secondsAllowed?: number;
  streak?: number; // correct answers in a row
  multiplier?: number; // damage multiplier of your next hit
};

export type AnswerResult = {
  correct: boolean;
  damage: number;
  correctIndex: number;
  hpRemaining: number;
  streak: number;
  multiplier: number;
};

export type FeedItem = {
  id: number;
  uid: string;
  name: string;
  damage: number;
  correct: boolean;
  streak: number;
};

export type EndInfo = {
  result: "won" | "lost";
  leaderboard: Player[];
  badges: RaidBadge[];
};

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

export type BadgeId = "first_blood" | "mvp" | "perfect_run" | "slayer";
export type RaidBadge = { uid: string; badge: BadgeId };

// an emoji someone sent during the raid
export type EmoteEvent = { id: number; uid: string; emote: string };

// one row of the "top raiders" list
export type RaidRanking = {
  uid: string;
  name: string;
  damage: number;
  raids: number;
  wins: number;
};