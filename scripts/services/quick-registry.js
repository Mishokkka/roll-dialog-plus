import { ARMOR_QUICK_MODIFIERS, QUICK_MODIFIERS } from "../constants.js";
import { log } from "../core/logging.js";

const registries = Object.assign(Object.create(null), {
  skill: structuredCloneSafe(QUICK_MODIFIERS),
  armor: structuredCloneSafe(ARMOR_QUICK_MODIFIERS)
});

/**
 * Returns an isolated copy of the requested Quick modifier registry.
 */
export function getQuickModifierGroups(type = "skill") {
  const registryType = String(type ?? "skill");
  const groups = Object.hasOwn(registries, registryType) ? registries[registryType] : null;
  if (!groups) {
    log.warn(`Unknown quick modifier registry type '${registryType}', falling back to 'skill'`);
    return structuredCloneSafe(registries.skill);
  }
  return structuredCloneSafe(groups);
}

/**
 * Registers or replaces a Quick modifier group for an integration type.
 */
export function registerQuickModifierGroup(group, { type = "skill", replace = false } = {}) {
  if (!group?.key) throw new Error("Quick modifier group requires a key");
  const registryType = String(type ?? "skill");
  const target = Object.hasOwn(registries, registryType) ? registries[registryType] : (registries[registryType] = []);
  const index = target.findIndex((entry) => entry.key === group.key);
  if (index >= 0 && !replace) throw new Error(`Quick modifier group '${group.key}' is already registered`);
  if (index >= 0) target.splice(index, 1, structuredCloneSafe(group));
  else target.push(structuredCloneSafe(group));
}

/**
 * Clones integration registry data without sharing mutable arrays or objects.
 */
function structuredCloneSafe(value) {
  if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
