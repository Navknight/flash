// backend/raidLogic.ts
// The game rules of Boss Raid as plain functions: no database, no sockets.
// That keeps them easy to test (see raidLogic.test.ts) and easy to change in one place.

// How many seconds you get for the speed bonus on one question.
export const ANSWER_WINDOW_SEC = 20;

// Damage multiplier for the NEXT hit, given how many correct answers in a row you have.
// x1.0 with no streak, +10% per correct answer in a row, capped at x1.5 (5 in a row).
export function comboMultiplier(streak: number): number {
  return 1 + Math.min(Math.max(streak, 0), 5) * 0.1;
}

// Your streak after answering: one more if you were right, back to 0 if you were wrong.
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

// Allows at most `max` calls per `windowMs` for each key (for example a user id).
// Returns a function: call it with the key, it says true (allowed) or false (too fast).
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