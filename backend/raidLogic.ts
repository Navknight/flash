// The game rules of Boss Raid as plain functions

// How many seconds you get for the speed bonus on one question.
export const ANSWER_WINDOW_SEC = 20;

// Damage multiplier for the NEXT hit, given how many correct answers in a row you have.
// x1.0 with no streak, +10% per correct answer in a row, capped at x1.5 (5 in a row).
export function comboMultiplier(streak: number): number {
  return 1 + Math.min(Math.max(streak, 0), 5) * 0.1;
}

// streak after answering: one more if you were right, back to 0 if you were wrong.
export function nextStreak(correct: boolean, streakBefore: number): number {
  return correct ? streakBefore + 1 : 0;
}

// Damage of one answer:
//   wrong answer                  -> 0
//   right answer                  -> baseDamage, plus up to +50% for answering fast
//   multiplied by the combo bonus -> up to 100 * 1.5 * 1.5 = 225 with the default base
export function computeDamage(opts: {
  correct: boolean;
  baseDamage: number;
  elapsedSec: number;
  streakBefore: number;
}): number {
  if (!opts.correct) return 0;
  const speed = Math.max(0, 1 - opts.elapsedSec / ANSWER_WINDOW_SEC);
  return Math.round(
    opts.baseDamage * (1 + 0.5 * speed) * comboMultiplier(opts.streakBefore),
  );
}

// Allows at most `max` calls per `windowMs` for each key (for example a user id). Returns a function: call it with the key, it says true (allowed) or false (too fast).
export function createLimiter(
  max: number,
  windowMs: number,
  now: () => number = Date.now,
) {
  const hits = new Map<string, number[]>();
  return (key: string): boolean => {
    const t = now();
    const recent = (hits.get(key) ?? []).filter((x) => t - x < windowMs);
    if (recent.length >= max) {
      hits.set(key, recent);
      return false;
    }
    recent.push(t);
    hits.set(key, recent);
    return true;
  };
}

// The emoji a player can send during a raid. The server only accepts these (keep in sync with EMOTES in frontend).
export const EMOTES = ["🔥", "👏", "😂", "💪", "😱"];

export type BadgeId = "first_blood" | "mvp" | "perfect_run" | "slayer";

// Badges handed out when a raid is WON:
//   mvp         dealt the most damage (needs at least 1 damage)
//   perfect_run answered every question, and every answer was correct
//   first_blood landed the first correct answer of the raid
//   slayer      landed the last correct answer, the one that killed the boss
// One player can earn several. The caller finds first_blood / slayer in the database.
export function computeBadges(input: {
  players: {
    uid: string;
    totalDamage: number;
    correct: number;
    answered: number;
  }[];
  questionCount: number;
  firstBloodUid: string | null;
  slayerUid: string | null;
}): { uid: string; badge: BadgeId }[] {
  const out: { uid: string; badge: BadgeId }[] = [];

  // strictly greater, so on a tie the player listed first keeps it
  const top = input.players.reduce<(typeof input.players)[number] | null>(
    (best, p) => (p.totalDamage > (best?.totalDamage ?? 0) ? p : best),
    null,
  );
  if (top) out.push({ uid: top.uid, badge: "mvp" });

  for (const p of input.players) {
    if (
      input.questionCount > 0 &&
      p.answered === input.questionCount &&
      p.correct === p.answered
    )
      out.push({ uid: p.uid, badge: "perfect_run" });
  }

  if (input.firstBloodUid)
    out.push({ uid: input.firstBloodUid, badge: "first_blood" });
  if (input.slayerUid) out.push({ uid: input.slayerUid, badge: "slayer" });
  return out;
}