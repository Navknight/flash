import test from "node:test";
import assert from "node:assert/strict";
import {
  comboMultiplier,
  computeBadges,
  computeDamage,
  createLimiter,
  EMOTES,
  nextStreak,
} from "./raidLogic.ts";

const near = (actual: number, expected: number) =>
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    `${actual} is not close to ${expected}`,
  );

test("combo multiplier adds 10% per correct answer in a row", () => {
  near(comboMultiplier(0), 1);
  near(comboMultiplier(1), 1.1);
  near(comboMultiplier(3), 1.3);
});

test("combo multiplier is capped at x1.5 and never goes below x1", () => {
  near(comboMultiplier(5), 1.5);
  near(comboMultiplier(50), 1.5);
  near(comboMultiplier(-4), 1);
});

test("the streak grows on a correct answer and resets on a wrong one", () => {
  assert.equal(nextStreak(true, 0), 1);
  assert.equal(nextStreak(true, 4), 5);
  assert.equal(nextStreak(false, 4), 0);
});

test("a wrong answer deals no damage, whatever the streak", () => {
  assert.equal(
    computeDamage({ correct: false, baseDamage: 100, elapsedSec: 0, streakBefore: 5 }),
    0,
  );
});

test("an instant correct answer deals 150 with the default base damage", () => {
  assert.equal(
    computeDamage({ correct: true, baseDamage: 100, elapsedSec: 0, streakBefore: 0 }),
    150,
  );
});

test("a slow correct answer (past the speed window) deals only the base damage", () => {
  assert.equal(
    computeDamage({ correct: true, baseDamage: 100, elapsedSec: 20, streakBefore: 0 }),
    100,
  );
  assert.equal(
    computeDamage({ correct: true, baseDamage: 100, elapsedSec: 999, streakBefore: 0 }),
    100,
  );
});

test("the speed bonus shrinks linearly: half the window gives +25%", () => {
  assert.equal(
    computeDamage({ correct: true, baseDamage: 100, elapsedSec: 10, streakBefore: 0 }),
    125,
  );
});

test("the best possible answer (instant, 5 in a row) deals 225", () => {
  assert.equal(
    computeDamage({ correct: true, baseDamage: 100, elapsedSec: 0, streakBefore: 5 }),
    225,
  );
});

test("the limiter blocks after the maximum and recovers after the window", () => {
  let now = 0;
  const allow = createLimiter(2, 1000, () => now);
  assert.equal(allow("a"), true);
  assert.equal(allow("a"), true);
  assert.equal(allow("a"), false); // third call inside the window
  assert.equal(allow("b"), true); // other users are not affected
  now = 1001;
  assert.equal(allow("a"), true); // the window has passed
});

// ---- badges ----

const player = (uid: string, totalDamage: number, correct: number, answered: number) => ({
  uid,
  totalDamage,
  correct,
  answered,
});

test("the player with the most damage gets MVP, the first one listed wins a tie", () => {
  const badges = computeBadges({
    players: [player("a", 300, 3, 5), player("b", 500, 4, 5), player("c", 500, 4, 5)],
    questionCount: 5,
    firstBloodUid: null,
    slayerUid: null,
  });
  assert.deepEqual(badges, [{ uid: "b", badge: "mvp" }]);
});

test("nobody gets MVP when nobody dealt damage", () => {
  const badges = computeBadges({
    players: [player("a", 0, 0, 3), player("b", 0, 0, 3)],
    questionCount: 3,
    firstBloodUid: null,
    slayerUid: null,
  });
  assert.deepEqual(badges, []);
});

test("perfect run needs every question answered and every answer correct", () => {
  const badges = computeBadges({
    players: [
      player("a", 100, 5, 5), // perfect
      player("b", 90, 4, 5), // one wrong
      player("c", 80, 3, 3), // all correct but did not finish
    ],
    questionCount: 5,
    firstBloodUid: null,
    slayerUid: null,
  });
  assert.deepEqual(
    badges.filter((b) => b.badge === "perfect_run"),
    [{ uid: "a", badge: "perfect_run" }],
  );
});

test("first blood and slayer are passed through, and one player can hold several badges", () => {
  const badges = computeBadges({
    players: [player("a", 700, 5, 5), player("b", 300, 2, 5)],
    questionCount: 5,
    firstBloodUid: "a",
    slayerUid: "a",
  });
  const mine = badges.filter((b) => b.uid === "a").map((b) => b.badge).sort();
  assert.deepEqual(mine, ["first_blood", "mvp", "perfect_run", "slayer"]);
  assert.equal(badges.filter((b) => b.uid === "b").length, 0);
});

test("emotes are a short list of single emoji", () => {
  assert.ok(EMOTES.length >= 3);
  assert.equal(new Set(EMOTES).size, EMOTES.length);
});