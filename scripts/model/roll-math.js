import { activeNumericModifierSum } from "../modifiers.js";
import { parseNumber } from "../utils.js";

export function activeCustomModifierSum(modifiers = [], { excludeKinds = [] } = {}) {
  const values = modifiers instanceof Map ? [...modifiers.values()] : [...modifiers];
  const excluded = new Set(excludeKinds);
  return values.reduce((sum, modifier) => {
    if (!modifier?.active || excluded.has(modifier.kind)) return sum;
    return sum + parseNumber(modifier.value, 0);
  }, 0);
}

export function activeGearBonusTotal(modifiers = []) {
  return modifiers.reduce((sum, modifier) => {
    if (!modifier?.checked || !modifier.gearBonus) return sum;
    return sum + Math.max(0, parseNumber(modifier.value, 0));
  }, 0);
}

export function calculateSkillModifierTotal({ residual = 0, systemModifiers = [], customModifiers = [] } = {}) {
  return parseNumber(residual, 0)
    + activeNumericModifierSum(systemModifiers)
    + activeCustomModifierSum(customModifiers);
}

export function calculateArmorDiceTotal({
  armor = 0,
  residual = 0,
  systemModifiers = [],
  customModifiers = [],
  factor = 1,
  rounding = "floor"
} = {}) {
  const adjustment = parseNumber(residual, 0)
    + activeNumericModifierSum(systemModifiers)
    + activeCustomModifierSum(customModifiers, { excludeKinds: ["armor-half"] })
    + activeGearBonusTotal(systemModifiers);
  const raw = Math.max(0, parseNumber(armor, 0) + adjustment) * Math.max(0, Number(factor) || 0);
  if (rounding === "ceil") return Math.ceil(raw);
  if (rounding === "round") return Math.round(raw);
  return Math.floor(raw);
}
