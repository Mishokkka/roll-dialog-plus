import { ARTIFACT_DICE } from "./constants.js";
import { normalizeKey, parseBoolean, parseNumber, slugify } from "./utils.js";

export function artifactCountsFromValues(...values) {
  const counts = { d8: 0, d10: 0, d12: 0 };
  for (const value of values) {
    const parsed = parseArtifactDice(value);
    for (const die of ARTIFACT_DICE) counts[die] += parsed[die] ?? 0;
  }
  return counts;
}

export function formatArtifactCounts(counts) {
  const parts = [];
  for (const die of ARTIFACT_DICE) {
    const count = Math.max(0, parseNumber(counts?.[die], 0));
    if (!count) continue;
    parts.push(`${count > 1 ? count : ""}${die.toUpperCase()}`);
  }
  return parts.join(" + ") || "0";
}


export function cleanModifierName(value, artifactCounts = {}) {
  let name = String(value ?? "").replace(/\s+/g, " ").trim();
  const hasArtifacts = ARTIFACT_DICE.some((die) => parseNumber(artifactCounts?.[die], 0) > 0);

  // Native Forbidden Lands roll rows may render the die face separately from the
  // textual count, leaving labels such as "Painter 1d" in textContent even though
  // the checkbox value is "1d8". Remove only a trailing dice-display fragment,
  // and only when the modifier is already known to contain artifact dice.
  if (hasArtifacts) {
    name = name
      .replace(/(?:\s*[+＋]\s*)?(?:\d+\s*)?[dд]\s*(?:8|10|12|₈|₁₀|₁₂)?\s*$/i, "")
      .trim();
  }

  return name.replace(/\s+/g, " ").trim();
}

export function addArtifactCounts(a = {}, b = {}) {
  const counts = { d8: 0, d10: 0, d12: 0 };
  for (const die of ARTIFACT_DICE) counts[die] = Math.max(0, parseNumber(a?.[die], 0)) + Math.max(0, parseNumber(b?.[die], 0));
  return counts;
}

export function readNativeSystemModifiers(form) {
  const optionInputs = [...form.querySelectorAll(".options input[type='checkbox']")];
  const inputs = optionInputs.length
    ? optionInputs
    : [...form.querySelectorAll("input.option[type='checkbox']")];
  const rows = [];
  const idCounts = new Map();

  inputs.forEach((input, index) => {
    const row = input.closest(".modifier, .mod, li, tr, .row, div") ?? input.parentElement;
    const text = (row?.textContent ?? input.name ?? `Modifier ${index + 1}`).replace(/\s+/g, " ").trim();
    const rawValue = input.dataset?.value ?? input.value ?? text;
    const gearBonus = parseBoolean(input.dataset?.gearBonus, false) || /^true_/i.test(input.name ?? "");
    let artifactCounts = artifactCountsFromValues(rawValue);
    if (!Object.values(artifactCounts).some((n) => n > 0)) artifactCounts = artifactCountsFromValues(text);
    const isArtifact = Object.values(artifactCounts).some((n) => n > 0);
    const valueMatch = text.match(/([+-]?\d+)\s*$/);
    const value = isArtifact ? 0 : (valueMatch ? parseNumber(valueMatch[1], 0) : parseNumber(input.dataset?.value ?? input.value, 0));
    const display = isArtifact ? formatArtifactCounts(artifactCounts) : undefined;
    const name = cleanModifierName(
      text
        .replace(/([+-]?\d+)\s*$/, "")
        .replace(/(?:\d+\s*)?d(?:8|10|12)/gi, "")
        .replace(/\s+/g, " ")
        .trim(),
      artifactCounts
    ) || input.name || `Modifier ${index + 1}`;
    const sourceUuid = input.dataset?.itemUuid ?? input.dataset?.sourceUuid ?? row?.dataset?.itemUuid ?? row?.dataset?.sourceUuid ?? null;
    const sourceId = input.dataset?.itemId ?? input.dataset?.sourceId ?? input.dataset?.id ?? row?.dataset?.itemId ?? row?.dataset?.sourceId ?? row?.dataset?.id ?? null;
    const ruleKey = input.dataset?.ruleKey ?? input.dataset?.key ?? row?.dataset?.ruleKey ?? row?.dataset?.key ?? null;
    const nativeName = input.name ?? null;
    const stableBase = slugify(sourceUuid || sourceId || ruleKey || nativeName || name) || "modifier";
    const occurrence = idCounts.get(stableBase) ?? 0;
    idCounts.set(stableBase, occurrence + 1);

    rows.push({
      id: `native-${stableBase}-${occurrence}`,
      name,
      value,
      display: gearBonus && !isArtifact ? `Gear ${value > 0 ? `+${value}` : value}` : display,
      artifactCounts,
      gearBonus,
      checked: !!input.checked,
      input,
      origin: "dom",
      nativeName,
      nativeValue: input.value,
      sourceUuid,
      sourceId,
      ruleKey,
      originalDisabled: !!input.disabled,
      explanation: input.title ?? row?.title ?? ""
    });
  });

  return rows;
}

export function mergeSystemModifiers(domModifiers = [], actorModifiers = [], previous = []) {
  const previousState = buildCheckState(previous);
  const output = domModifiers.map(cloneModifier);
  const unmatched = new Set(output.map((_modifier, index) => index));
  const sourceIndexes = buildIndexQueues(output, modifierSourceKey);
  const compatibilityIndexes = buildIndexQueues(output, modifierCompatibilityKey);

  for (const modifier of output) modifier._previousApplied = applyPreviousCheck(modifier, previousState);

  for (const actorModifier of actorModifiers) {
    const exactKey = modifierSourceKey(actorModifier);
    let matchIndex = exactKey ? takeMatchingIndex(sourceIndexes.get(exactKey), unmatched) : -1;

    if (matchIndex < 0) {
      const compatibilityKey = modifierCompatibilityKey(actorModifier);
      matchIndex = takeMatchingIndex(compatibilityIndexes.get(compatibilityKey), unmatched, (candidateIndex) => {
        const candidateSource = modifierSourceKey(output[candidateIndex]);
        return !exactKey || !candidateSource;
      });
    }

    if (matchIndex >= 0) {
      const existing = output[matchIndex];
      unmatched.delete(matchIndex);
      existing.sourceUuid ??= actorModifier.sourceUuid;
      existing.sourceId ??= actorModifier.sourceId;
      existing.ruleKey ??= actorModifier.ruleKey;
      existing.explanation ||= actorModifier.explanation;
      existing.origin = existing.origin === "dom" ? "dom+actor" : existing.origin;
      if (!existing._previousApplied) existing._previousApplied = applyPreviousCheck(existing, previousState, modifierIdentity(actorModifier));
      continue;
    }

    const clone = cloneModifier(actorModifier);
    clone._previousApplied = applyPreviousCheck(clone, previousState);
    output.push(clone);
  }

  for (const modifier of output) delete modifier._previousApplied;
  return deduplicateSystemModifiers(output);
}

export function deduplicateSystemModifiers(modifiers = []) {
  const output = [];
  const seen = new Map();

  for (const sourceModifier of modifiers ?? []) {
    const modifier = cloneModifier(sourceModifier);
    const key = duplicateModifierKey(modifier);
    if (!key || modifier.specialRoll) {
      output.push(modifier);
      continue;
    }

    const existing = seen.get(key);
    if (!existing) {
      existingInputList(modifier);
      modifier.nativeActiveCopies = nativeActiveCopies(modifier);
      output.push(modifier);
      seen.set(key, modifier);
      continue;
    }

    existing.nativeActiveCopies = Math.max(0, parseNumber(existing.nativeActiveCopies, 0)) + nativeActiveCopies(modifier);
    existing.checked = !!existing.checked || !!modifier.checked;
    existing.explanation ||= modifier.explanation;
    existing.sourceUuid ??= modifier.sourceUuid;
    existing.sourceId ??= modifier.sourceId;
    existing.ruleKey ??= modifier.ruleKey;
    existing.nativeName ??= modifier.nativeName;
    existing.nativeValue ??= modifier.nativeValue;
    existing.origin = mergeOrigins(existing.origin, modifier.origin);
    existing.linkedInputs = uniqueInputs([
      ...(existing.linkedInputs ?? []),
      existing.input,
      ...(modifier.linkedInputs ?? []),
      modifier.input
    ]);
    existing.input ??= existing.linkedInputs[0] ?? null;
  }

  return output;
}

export function modifierIdentity(modifier) {
  if (modifier?.specialRoll && modifier?.id) return `special:${modifier.id}`;
  const source = modifierSourceKey(modifier);
  if (source) return source;
  if (modifier?.nativeName) return `native:${normalizeKey(modifier.nativeName)}:${String(modifier.nativeValue ?? "")}`;
  return `compat:${modifierCompatibilityKey(modifier)}`;
}

export function modifierCompatibilityKey(modifier) {
  const artifactCounts = { d8: 0, d10: 0, d12: 0, ...(modifier?.artifactCounts ?? {}) };
  const artifacts = ARTIFACT_DICE.map((die) => `${die}:${parseNumber(artifactCounts[die], 0)}`).join("|");
  const comparableName = cleanModifierName(modifier?.name, artifactCounts);
  return [normalizeKey(comparableName), parseNumber(modifier?.value, 0), modifier?.gearBonus ? 1 : 0, artifacts].join("::");
}

export function activeNumericModifierSum(modifiers = [], { domOnly = false } = {}) {
  return modifiers.reduce((sum, modifier) => {
    if (!modifier?.checked || modifier?.gearBonus || hasModifierArtifacts(modifier)) return sum;
    if (domOnly && !modifier.input && !String(modifier.origin ?? "").includes("dom")) return sum;
    const copies = domOnly ? Math.max(1, parseNumber(modifier.nativeActiveCopies, 1)) : 1;
    return sum + parseNumber(modifier.value, 0) * copies;
  }, 0);
}

export function activeArtifactModifierCounts(modifiers = []) {
  return (modifiers ?? []).reduce(
    (counts, modifier) => modifier?.checked ? addArtifactCounts(counts, modifier.artifactCounts) : counts,
    { d8: 0, d10: 0, d12: 0 }
  );
}

export function calculateModifierResidual(initialModifierValue, modifiers = []) {
  return parseNumber(initialModifierValue, 0) - activeNumericModifierSum(modifiers, { domOnly: true });
}

export function parseArtifactDice(value) {
  const counts = { d8: 0, d10: 0, d12: 0 };
  const text = String(value ?? "").toLowerCase();

  for (const die of ARTIFACT_DICE) {
    const regex = new RegExp(`(?:(\\d+)\\s*)?${die}`, "g");
    let match;
    while ((match = regex.exec(text)) !== null) counts[die] += parseNumber(match[1], 1);
  }

  return counts;
}

export function buildArtifactValue(counts) {
  const dice = [];
  for (const die of ARTIFACT_DICE) {
    const count = Math.max(0, parseNumber(counts?.[die], 0));
    if (!count) continue;
    dice.push(`${count > 1 ? count : ""}${die}`);
  }
  return dice.join("+");
}



function nativeActiveCopies(modifier) {
  if (!modifier?.checked) return 0;
  const hasNativeInput = !!modifier?.input || (modifier?.linkedInputs?.length ?? 0) > 0;
  return hasNativeInput || String(modifier?.origin ?? "").includes("dom") ? 1 : 0;
}

function duplicateModifierKey(modifier) {
  const source = modifierSourceKey(modifier);
  if (!source) return null;
  return `${source}::${modifierCompatibilityKey(modifier)}`;
}

function existingInputList(modifier) {
  modifier.linkedInputs = uniqueInputs([...(modifier.linkedInputs ?? []), modifier.input]);
  modifier.input ??= modifier.linkedInputs[0] ?? null;
  return modifier.linkedInputs;
}

function uniqueInputs(inputs) {
  return [...new Set(inputs.filter(Boolean))];
}

function mergeOrigins(a, b) {
  const tokens = new Set(`${a ?? ""}+${b ?? ""}`.split("+").filter(Boolean));
  if (tokens.has("dom") && tokens.has("actor")) return "dom+actor";
  return [...tokens].join("+") || "unknown";
}

function modifierSourceKey(modifier) {
  const value = modifier?.sourceUuid ?? modifier?.sourceId ?? modifier?.ruleKey ?? null;
  if (!value) return null;
  return `source:${normalizeKey(value)}`;
}

function buildIndexQueues(modifiers, keyFn) {
  const queues = new Map();
  modifiers.forEach((modifier, index) => {
    const key = keyFn(modifier);
    if (!key) return;
    const queue = queues.get(key) ?? [];
    queue.push(index);
    queues.set(key, queue);
  });
  return queues;
}

function takeMatchingIndex(queue, unmatched, predicate = null) {
  if (!queue?.length) return -1;
  for (const index of queue) {
    if (!unmatched.has(index)) continue;
    if (predicate && !predicate(index)) continue;
    return index;
  }
  return -1;
}

function buildCheckState(modifiers) {
  const state = new Map();
  for (const modifier of modifiers) {
    const identity = modifierIdentity(modifier);
    const queue = state.get(identity) ?? [];
    queue.push(!!modifier.checked);
    state.set(identity, queue);
  }
  return state;
}

function applyPreviousCheck(modifier, state, identity = modifierIdentity(modifier)) {
  const queue = state.get(identity);
  if (!queue?.length) return false;
  modifier.checked = queue.shift();
  return true;
}

function cloneModifier(modifier) {
  return {
    ...modifier,
    artifactCounts: { d8: 0, d10: 0, d12: 0, ...(modifier?.artifactCounts ?? {}) },
    linkedInputs: Array.isArray(modifier?.linkedInputs) ? [...modifier.linkedInputs] : modifier?.linkedInputs
  };
}

function hasModifierArtifacts(modifier) {
  return Object.values(modifier?.artifactCounts ?? {}).some((value) => parseNumber(value, 0) > 0);
}
