import { log } from "../core/logging.js";
import { normalizeKey, parseNumber } from "../utils.js";

const ARMOR_KEYS = new Set([
  "armor",
  "armour",
  "armor-roll",
  "armour-roll",
  "roll-armor",
  "roll-armour",
  "доспех",
  "броня",
  "бросок-брони",
  "бросок-доспеха"
]);

/**
 * Detects skill or armor mode from structured application and form data.
 */
export function detectRollType({ app = null, form = null, title = "", baseLabel = "", skillLabel = "", skillKey = "" } = {}) {
  const structured = [
    app?.options?.rollType,
    app?.options?.type,
    app?.options?.action,
    app?.options?.mishapType,
    app?.rollType,
    app?.type,
    form?.dataset?.rollType,
    form?.dataset?.type,
    form?.dataset?.action,
    form?.dataset?.mishapType,
    skillKey
  ].map(normalizeKey).filter(Boolean);

  if (structured.some(isArmorKey)) return "armor";

  const gearCategory = normalizeKey(app?.gear?.category ?? app?.gear?.type ?? app?.gear?.system?.category ?? app?.item?.type);
  if (isArmorKey(gearCategory)) return "armor";

  return isArmorRollTitle(title, baseLabel, skillLabel) ? "armor" : "skill";
}

/**
 * Infers the armor die value from native roll fields and labels.
 */
export function inferArmorDiceValue({ base, skill, gear, baseLabel, skillLabel, title }) {
  const values = {
    base: parseNumber(base?.value, 0),
    skill: parseNumber(skill?.value, 0),
    gear: parseNumber(gear?.value, 0)
  };
  let branch = "empty";
  let result = 0;
  if (isArmorRollTitle(baseLabel)) {
    branch = "base-label";
    result = values.base;
  } else if (isArmorRollTitle(skillLabel)) {
    branch = "skill-label";
    result = values.skill;
  } else if (values.gear > 0) {
    branch = "gear-field";
    result = values.gear;
  } else if (values.base > 0 || values.skill > 0) {
    branch = "largest-generic-field";
    result = Math.max(values.base, values.skill);
  }
  log.debug("Armor dice inference", { title, baseLabel, skillLabel, values, branch, result });
  return result;
}

/**
 * Checks whether any supplied title identifies an armor roll.
 */
export function isArmorRollTitle(...values) {
  return values.map(normalizeKey).filter(Boolean).some((value) => {
    if (isArmorKey(value)) return true;
    return /(^|-)(armor|armour|доспех|броня)($|-)/.test(value);
  });
}

function isArmorKey(value) {
  return ARMOR_KEYS.has(normalizeKey(value));
}
