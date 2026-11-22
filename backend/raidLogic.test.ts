// Run with:  node --test raidLogic.test.ts   (from the backend folder)
import test from "node:test";
import assert from "node:assert/strict";
import {
  comboMultiplier,
  computeDamage,
  createLimiter,
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