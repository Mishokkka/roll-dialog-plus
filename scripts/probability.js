import { ARTIFACT_DICE } from "./constants.js";
import { parseNumber } from "./utils.js";

const DIE_SUCCESS_DISTRIBUTIONS = Object.freeze({
  d6: [5 / 6, 1 / 6],
  d8: [5 / 8, 2 / 8, 1 / 8],
  d10: [5 / 10, 2 / 10, 2 / 10, 1 / 10],
  d12: [5 / 12, 2 / 12, 2 / 12, 2 / 12, 1 / 12]
});

/**
 * Coerces a dice count to a finite non-negative integer.
 */
function nonNegativeInteger(value) {
  return Math.max(0, Math.trunc(parseNumber(value, 0)));
}

/**
 * Mirror Forbidden Lands v13.0.5 FBLRollHandler behavior.
 * A negative skill + modifier result does not remove base/gear dice. Instead,
 * the system rolls that many negative d6 whose sixes subtract successes.
 */
export function normalizeDicePool({ base = 0, skill = 0, gear = 0, modifier = 0 } = {}) {
  const baseDice = nonNegativeInteger(base);
  const rawSkill = nonNegativeInteger(skill);
  const gearDice = nonNegativeInteger(gear);
  const difference = rawSkill + Math.trunc(parseNumber(modifier, 0));

  return {
    base: baseDice,
    skill: Math.max(0, difference),
    gear: gearDice,
    negative: Math.max(0, -difference)
  };
}

/**
 * Returns a distribution indexed by usable successes. Any zero or negative net
 * result is folded into index 0 because it is a failed Forbidden Lands roll.
 */
export function calculateSuccessDistribution(payload = {}, { pushed = false } = {}) {
  const pool = normalizeDicePool(payload);
  let positive = [1];

  if (pushed) {
    positive = addDice(positive, [13 / 18, 5 / 18], pool.base);
    positive = addDice(positive, [25 / 36, 11 / 36], pool.skill);
    positive = addDice(positive, [13 / 18, 5 / 18], pool.gear);
  } else {
    positive = addDice(positive, DIE_SUCCESS_DISTRIBUTIONS.d6, pool.base + pool.skill + pool.gear);
  }

  for (const die of ARTIFACT_DICE) {
    const count = nonNegativeInteger(payload?.artifactCounts?.[die]);
    if (!count) continue;
    const dieDistribution = pushed
      ? pushedArtifactDistribution(DIE_SUCCESS_DISTRIBUTIONS[die])
      : DIE_SUCCESS_DISTRIBUTIONS[die];
    positive = addDice(positive, dieDistribution, count);
  }

  if (!pool.negative) return normalizeDistribution(positive);

  const negativeDie = pushed ? [25 / 36, 11 / 36] : DIE_SUCCESS_DISTRIBUTIONS.d6;
  const negative = addDice([1], negativeDie, pool.negative);
  return cancelNegativeSuccesses(positive, negative);
}

/**
 * Calculates the chance of at least one net success.
 */
export function calculateSuccessChance(payload = {}) {
  return chanceFromDistribution(calculateSuccessDistribution(payload));
}

/**
 * Calculates current and pushed success chances and push damage risks.
 */
export function calculateChanceAnalysis(payload = {}) {
  const pool = normalizeDicePool(payload);
  const distribution = calculateSuccessDistribution(payload);
  const pushedDistribution = calculateSuccessDistribution(payload, { pushed: true });
  return {
    pool,
    chance: chanceFromDistribution(distribution),
    pushedChance: chanceFromDistribution(pushedDistribution),
    expectedSuccesses: expectedSuccesses(distribution),
    pushedExpectedSuccesses: expectedSuccesses(pushedDistribution),
    attributeDamageRisk: clamp01(1 - Math.pow(13 / 18, pool.base)),
    gearDamageRisk: clamp01(1 - Math.pow(13 / 18, pool.gear)),
    distribution,
    pushedDistribution,
    buckets: bucketDistribution(distribution),
    pushedBuckets: bucketDistribution(pushedDistribution),
    totalDice: totalDiceCount(payload),
    positiveDice: totalPositiveDiceCount(payload),
    negativeOnly: totalPositiveDiceCount(payload) === 0 && pool.negative > 0
  };
}

/**
 * Formats a probability as a percentage string.
 */
export function formatChance(chance) {
  const pct = Math.round(clamp01(Number(chance) || 0) * 1000) / 10;
  return `${Number.isInteger(pct) ? pct.toFixed(0) : pct.toFixed(1)}%`;
}

/**
 * Formats an expected-success value for the UI.
 */
export function formatExpected(value) {
  const number = Math.round((Number(value) || 0) * 100) / 100;
  return Number.isInteger(number) ? number.toFixed(0) : number.toFixed(2).replace(/0$/, "");
}

/**
 * Builds a compact human-readable description of a dice pool.
 */
export function describeChancePool({ base = 0, skill = 0, gear = 0, modifier = 0, artifactCounts = {} } = {}) {
  const pool = normalizeDicePool({ base, skill, gear, modifier });
  const positiveD6 = pool.base + pool.skill + pool.gear;
  const parts = [];
  if (positiveD6) parts.push(`${positiveD6}d6`);
  if (pool.negative) parts.push(`${pool.negative}nd6`);

  for (const die of ARTIFACT_DICE) {
    const count = nonNegativeInteger(artifactCounts?.[die]);
    if (count) parts.push(`${count}${die}`);
  }

  return parts.length ? parts.join(" + ") : "0 dice";
}

/**
 * Counts positive D6 and artifact dice in a payload.
 */
export function totalPositiveDiceCount(payload = {}) {
  const pool = normalizeDicePool(payload);
  return pool.base + pool.skill + pool.gear
    + ARTIFACT_DICE.reduce((sum, die) => sum + nonNegativeInteger(payload?.artifactCounts?.[die]), 0);
}

/**
 * Counts every physical die represented by a payload.
 */
export function totalDiceCount(payload = {}) {
  const pool = normalizeDicePool(payload);
  return totalPositiveDiceCount(payload) + pool.negative;
}

function addDice(baseDistribution, dieDistribution, count) {
  let result = baseDistribution;
  for (let i = 0; i < count; i += 1) result = convolve(result, dieDistribution);
  return result;
}

function convolve(a, b) {
  const output = Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i += 1) {
    for (let j = 0; j < b.length; j += 1) output[i + j] += a[i] * b[j];
  }
  return output;
}

function cancelNegativeSuccesses(positive, negative) {
  const result = Array(positive.length).fill(0);
  for (let successes = 0; successes < positive.length; successes += 1) {
    for (let cancellations = 0; cancellations < negative.length; cancellations += 1) {
      result[Math.max(0, successes - cancellations)] += positive[successes] * negative[cancellations];
    }
  }
  return normalizeDistribution(result);
}

function pushedArtifactDistribution(base) {
  const failure = base[0] ?? 1;
  const result = Array(base.length).fill(0);
  result[0] = failure * failure;
  for (let successes = 1; successes < base.length; successes += 1) {
    result[successes] = (base[successes] ?? 0) * (1 + failure);
  }
  return normalizeDistribution(result);
}

function normalizeDistribution(distribution) {
  const total = distribution.reduce((sum, value) => sum + value, 0) || 1;
  return distribution.map((value) => value / total);
}

function chanceFromDistribution(distribution) {
  return clamp01(1 - (distribution[0] ?? 1));
}

function expectedSuccesses(distribution) {
  return distribution.reduce((sum, probability, successes) => sum + probability * successes, 0);
}

function bucketDistribution(distribution) {
  return {
    zero: distribution[0] ?? 0,
    one: distribution[1] ?? 0,
    two: distribution[2] ?? 0,
    threePlus: clamp01(1 - (distribution[0] ?? 0) - (distribution[1] ?? 0) - (distribution[2] ?? 0))
  };
}

/**
 * Restricts a numeric probability to the inclusive zero-to-one range.
 */
function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}
