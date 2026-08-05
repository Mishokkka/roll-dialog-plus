import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateChanceAnalysis,
  calculateSuccessChance,
  calculateSuccessDistribution,
  normalizeDicePool,
  totalDiceCount,
  totalPositiveDiceCount
} from "../scripts/probability.js";

const closeTo = (actual, expected, epsilon = 1e-12) => assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);

test("normalizes negative modifiers exactly like FBLRollHandler", () => {
  assert.deepEqual(normalizeDicePool({ base: 3, skill: 1, gear: 2, modifier: -3 }), {
    base: 3,
    skill: 0,
    gear: 2,
    negative: 2
  });
  assert.deepEqual(normalizeDicePool({ skill: 2, modifier: 3 }), {
    base: 0,
    skill: 5,
    gear: 0,
    negative: 0
  });
});

test("one d6 has the expected success chance before and after push", () => {
  const result = calculateChanceAnalysis({ base: 1 });
  closeTo(result.chance, 1 / 6);
  closeTo(result.pushedChance, 5 / 18);
  closeTo(result.attributeDamageRisk, 5 / 18);
});

test("negative dice cancel positive successes", () => {
  const payload = { base: 1, skill: 0, modifier: -1 };
  closeTo(calculateSuccessChance(payload), (1 / 6) * (5 / 6));
  closeTo(calculateChanceAnalysis(payload).pushedChance, (5 / 18) * (25 / 36));
});

test("negative-only pools have dice but cannot succeed", () => {
  const payload = { skill: 1, modifier: -2 };
  assert.equal(totalDiceCount(payload), 1);
  assert.equal(totalPositiveDiceCount(payload), 0);
  assert.equal(calculateSuccessChance(payload), 0);
  assert.deepEqual(calculateSuccessDistribution(payload), [1]);
});

test("artifact dice use the FBL multi-success table", () => {
  const distribution = calculateSuccessDistribution({ artifactCounts: { d12: 1 } });
  closeTo(distribution[0], 5 / 12);
  closeTo(distribution[1], 2 / 12);
  closeTo(distribution[2], 2 / 12);
  closeTo(distribution[3], 2 / 12);
  closeTo(distribution[4], 1 / 12);
});

test("mixed distributions remain normalized", () => {
  const distribution = calculateSuccessDistribution({
    base: 5,
    skill: 3,
    gear: 2,
    modifier: -6,
    artifactCounts: { d8: 1, d10: 2, d12: 1 }
  }, { pushed: true });
  closeTo(distribution.reduce((sum, value) => sum + value, 0), 1, 1e-10);
  assert.ok(distribution.every((value) => value >= 0 && value <= 1));
});
