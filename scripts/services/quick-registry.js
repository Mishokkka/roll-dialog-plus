import { ARMOR_QUICK_MODIFIERS, QUICK_MODIFIERS } from "../constants.js";

const registries = {
  skill: structuredCloneSafe(QUICK_MODIFIERS),
  armor: structuredCloneSafe(ARMOR_QUICK_MODIFIERS)
};

export function getQuickModifierGroups(type = "skill") {
  return structuredCloneSafe(registries[type] ?? registries.skill);
}

export function registerQuickModifierGroup(group, { type = "skill", replace = false } = {}) {
  if (!group?.key) throw new Error("Quick modifier group requires a key");
  const target = registries[type] ??= [];
  const index = target.findIndex((entry) => entry.key === group.key);
  if (index >= 0 && !replace) throw new Error(`Quick modifier group '${group.key}' is already registered`);
  if (index >= 0) target.splice(index, 1, structuredCloneSafe(group));
  else target.push(structuredCloneSafe(group));
}

function structuredCloneSafe(value) {
  if (typeof globalThis.structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
