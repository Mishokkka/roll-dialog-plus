import { localize } from "../core/i18n.js";
import { normalizeKey, parseNumber, signed } from "../utils.js";

const DODGE_PROFILE = {
  key: "dodge",
  skillKey: "move",
  titleKey: "SpecialRoll.Dodge.Title",
  titleFallback: "Dodge",
  infoKey: "SpecialRoll.Dodge.Info",
  infoFallback: "Roll Move. Each success cancels one success from the attack.",
  icon: "fa-solid fa-person-running",
  aliases: ["dodge", "уклонение", "уклониться"],
  systemActionKeys: ["ACTION.DODGE"],
  choices: [
    {
      key: "dodge-posture",
      labelKey: "SpecialRoll.Dodge.Posture",
      labelFallback: "After the dodge",
      items: [
        {
          id: "special-dodge-prone",
          labelKey: "SpecialRoll.Dodge.FallProne",
          fallback: "Fall prone",
          hintKey: "SpecialRoll.Dodge.FallProneHint",
          hintFallback: "Default rule: after dodging, the character falls prone.",
          value: 0,
          display: "±0",
          defaultActive: false
        },
        {
          id: "special-dodge-standing",
          labelKey: "SpecialRoll.Dodge.RemainStanding",
          fallback: "Remain standing",
          hintKey: "SpecialRoll.Dodge.RemainStandingHint",
          hintFallback: "Remain standing after the dodge at a −2 penalty.",
          value: -2,
          nativeLabelKeys: ["ROLL.STANDING_DODGE"],
          nativeFallbacks: ["Standing Dodge", "Остаться на ногах"],
          defaultActive: true
        }
      ]
    },
    {
      key: "dodge-attack-type",
      labelKey: "SpecialRoll.Dodge.AttackType",
      labelFallback: "Attack type",
      items: [
        {
          id: "special-dodge-other-attack",
          labelKey: "SpecialRoll.Dodge.OtherAttack",
          fallback: "Other attack",
          hintKey: "SpecialRoll.Dodge.OtherAttackHint",
          hintFallback: "No special Dodge modifier applies.",
          value: 0,
          display: "±0",
          defaultActive: true
        },
        {
          id: "special-dodge-slash",
          labelKey: "SpecialRoll.Dodge.Slash",
          fallback: "Slash",
          hintKey: "SpecialRoll.Dodge.SlashHint",
          hintFallback: "Dodge gains +2 against a Slash attack.",
          value: 2,
          nativeLabelKeys: ["ROLL.DODGE_SLASH"],
          nativeFallbacks: ["Dodge Slash", "Slash", "Рубящий удар"],
          defaultActive: false
        },
        {
          id: "special-dodge-firearm",
          labelKey: "SpecialRoll.Dodge.Firearm",
          fallback: "Firearm",
          hintKey: "SpecialRoll.Dodge.FirearmHint",
          hintFallback: "Table rule: Dodge suffers −2 against a firearm attack.",
          value: -2,
          defaultActive: false,
          houseRule: true,
          showHouseRuleBadge: false
        }
      ]
    }
  ]
};

const PARRY_PROFILE = {
  key: "parry",
  skillKey: "melee",
  titleKey: "SpecialRoll.Parry.Title",
  titleFallback: "Parry",
  infoKey: "SpecialRoll.Parry.Info",
  infoFallback: "Roll Melee and the selected weapon or shield Gear Bonus. Each success cancels one success from the attack.",
  icon: "fa-solid fa-shield-halved",
  aliases: ["parry", "парирование", "парировать", "блок"],
  systemActionKeys: ["ACTION.PARRY"],
  includeGearItemId: true,
  choices: [
    {
      key: "parry-attack-type",
      labelKey: "SpecialRoll.Parry.AttackType",
      labelFallback: "Attack type",
      items: [
        {
          id: "special-parry-slash",
          labelKey: "SpecialRoll.Parry.Slash",
          fallback: "Slash",
          hintKey: "SpecialRoll.Parry.SlashHint",
          hintFallback: "Parrying a Slash has no additional modifier.",
          value: 0,
          display: "±0",
          defaultActive: true
        },
        {
          id: "special-parry-stab",
          labelKey: "SpecialRoll.Parry.Stab",
          fallback: "Stab",
          hintKey: "SpecialRoll.Parry.StabHint",
          hintFallback: "Parrying a Stab with a weapon suffers −2.",
          value: -2,
          nativeLabelKeys: ["ROLL.PARRY_STAB"],
          nativeFallbacks: ["Parry Stab", "Stab", "Колющий удар"],
          onlyWhenNative: true,
          defaultActive: false
        },
        {
          id: "special-parry-punch",
          labelKey: "SpecialRoll.Parry.PunchKick",
          fallback: "Punch / Kick",
          hintKey: "SpecialRoll.Parry.PunchKickHint",
          hintFallback: "Parrying a Punch or Kick with a weapon gains +2.",
          value: 2,
          nativeLabelKeys: ["ROLL.PARRY_PUNCH"],
          nativeFallbacks: ["Parry Punch", "Punch", "Punch / Kick", "Удар кулаком или ногой"],
          onlyWhenNative: true,
          defaultActive: false
        },
        {
          id: "special-parry-shield-non-slash",
          labelKey: "SpecialRoll.Parry.ShieldNonSlash",
          fallback: "Stab or Punch / Kick",
          hintKey: "SpecialRoll.Parry.ShieldNonSlashHint",
          hintFallback: "A shield gains +2 when parrying a Stab, Punch, or Kick.",
          value: 2,
          nativeLabelKeys: ["ROLL.PARRY_NON_SLASH"],
          nativeFallbacks: ["Parry Non-Slash", "Non-Slash", "Колющий или безоружный удар"],
          onlyWhenNative: true,
          defaultActive: false
        }
      ]
    }
  ]
};

const profiles = new Map([
  [DODGE_PROFILE.key, clone(DODGE_PROFILE)],
  [PARRY_PROFILE.key, clone(PARRY_PROFILE)]
]);

export function getSpecialRollProfile(key) {
  const profile = profiles.get(String(key ?? ""));
  return profile ? clone(profile) : null;
}

export function listSpecialRollProfiles() {
  return [...profiles.values()].map(clone);
}

export function registerSpecialRollProfile(profile, { replace = false } = {}) {
  if (!profile?.key) throw new Error("Special roll profile requires a key");
  if (profiles.has(profile.key) && !replace) throw new Error(`Special roll profile '${profile.key}' is already registered`);
  profiles.set(profile.key, clone(profile));
}

export function resolveSpecialRollProfile({ app = null, form = null, title = "", skillKey = "", nativeModifiers = [] } = {}) {
  const normalizedSkill = normalizeKey(skillKey);
  const candidates = [
    app?.options?.mishapType,
    app?.options?.action,
    app?.options?.actionName,
    app?.options?.rollType,
    app?.options?.type,
    app?.mishapType,
    app?.action,
    app?.data?.title,
    form?.dataset?.action,
    form?.dataset?.rollType,
    title
  ].map(normalizeKey).filter(Boolean);

  for (const profile of profiles.values()) {
    const aliases = new Set([
      profile.key,
      ...(profile.aliases ?? []),
      ...(profile.systemActionKeys ?? []),
      ...(profile.systemActionKeys ?? []).map(systemLocalize)
    ].map(normalizeKey).filter(Boolean));
    if (candidates.some((candidate) => aliases.has(candidate))) return clone(profile);
    if (profile.skillKey && normalizedSkill && normalizeKey(profile.skillKey) !== normalizedSkill) continue;

    const nativeNames = new Set((nativeModifiers ?? []).map((modifier) => normalizeKey(modifier?.name)).filter(Boolean));
    const markers = (profile.choices ?? []).flatMap((group) => group.items ?? []).flatMap((item) => [
      ...(item.nativeLabelKeys ?? []).map(systemLocalize),
      ...(item.nativeFallbacks ?? [])
    ]).map(normalizeKey).filter(Boolean);
    if (markers.some((marker) => nativeNames.has(marker))) return clone(profile);
  }

  return null;
}

export function getSpecialRollView(profile) {
  if (!profile) return null;
  return {
    key: profile.key,
    title: localize(profile.titleKey, profile.titleFallback ?? profile.key),
    info: localize(profile.infoKey, profile.infoFallback ?? ""),
    icon: profile.icon ?? "fa-solid fa-dice"
  };
}

export function buildRollIdentifiers(profile, skillKey, attrKey, { app = null, form = null } = {}) {
  const identifiers = [profile?.key, skillKey, attrKey];
  if (profile?.includeGearItemId) {
    const itemId = app?.gear?.itemId
      ?? app?.gear?.id
      ?? app?.options?.itemId
      ?? app?.item?.id
      ?? form?.dataset?.itemId
      ?? form?.querySelector?.("[data-item-id]")?.dataset?.itemId;
    if (itemId) identifiers.push(itemId);
  }
  return [...new Set(identifiers.filter(Boolean))];
}

export function applySpecialRollProfile(modifiers = [], profile = null, previous = []) {
  if (!profile) return modifiers.map(cloneModifier);

  const source = modifiers.map(cloneModifier);
  const previousById = new Map((previous ?? []).filter((modifier) => modifier?.specialRollKey === profile.key).map((modifier) => [modifier.id, modifier]));
  const usedIndexes = new Set();
  const special = [];

  for (const group of profile.choices ?? []) {
    const groupItems = [];
    for (const definition of group.items ?? []) {
      const matchIndexes = findNativeModifierIndexes(source, definition, usedIndexes);
      const matchIndex = matchIndexes.find((index) => source[index]?.input) ?? matchIndexes[0] ?? -1;
      const matched = matchIndex >= 0 ? source[matchIndex] : null;
      if (definition.onlyWhenNative && !matched) continue;
      for (const index of matchIndexes) usedIndexes.add(index);
      const previousModifier = previousById.get(definition.id);
      const checked = previousModifier
        ? !!previousModifier.checked
        : matched
          ? !!matched.checked
          : !!definition.defaultActive;
      const selectionPriority = previousModifier ? 3 : matched?.checked ? 2 : definition.defaultActive ? 1 : 0;

      const modifier = {
        ...(matched ?? {}),
        id: definition.id,
        name: localize(definition.labelKey, definition.fallback ?? definition.id),
        value: parseNumber(definition.value, 0),
        display: definition.display ?? signed(definition.value),
        checked,
        origin: matched ? `${matched.origin ?? "native"}+special` : "special",
        explanation: localize(definition.hintKey, definition.hintFallback ?? ""),
        specialRoll: true,
        specialRollKey: profile.key,
        choiceGroup: group.key,
        choiceGroupLabel: localize(group.labelKey, group.labelFallback ?? group.key),
        houseRule: !!definition.houseRule,
        showHouseRuleBadge: definition.showHouseRuleBadge !== false,
        synthetic: !matched,
        _selectionPriority: selectionPriority
      };
      groupItems.push(modifier);
    }

    enforceSingleSelection(groupItems);
    for (const modifier of groupItems) {
      delete modifier._selectionPriority;
      special.push(modifier);
    }
  }

  const ordinary = source.filter((_modifier, index) => !usedIndexes.has(index));
  return [...special, ...ordinary];
}

export function partitionSpecialModifiers(modifiers = []) {
  return {
    special: modifiers.filter((modifier) => modifier?.specialRoll),
    ordinary: modifiers.filter((modifier) => !modifier?.specialRoll)
  };
}

function enforceSingleSelection(items) {
  if (!items.length) return;
  const selected = items
    .map((item, index) => ({ item, index, priority: item.checked ? item._selectionPriority : -1 }))
    .filter((entry) => entry.item.checked)
    .sort((a, b) => b.priority - a.priority || a.index - b.index)[0];
  const chosen = selected?.item ?? items[0];
  for (const item of items) item.checked = item === chosen;
}

function findNativeModifierIndexes(modifiers, definition, usedIndexes) {
  const expectedNames = [
    ...(definition.nativeLabelKeys ?? []).map(systemLocalize),
    ...(definition.nativeFallbacks ?? [])
  ].map(normalizeKey).filter(Boolean);
  if (!expectedNames.length) return [];
  const expectedValue = parseNumber(definition.value, 0);
  const indexes = [];
  modifiers.forEach((modifier, index) => {
    if (usedIndexes.has(index)) return;
    if (!expectedNames.includes(normalizeKey(modifier?.name))) return;
    if (parseNumber(modifier?.value, 0) !== expectedValue) return;
    indexes.push(index);
  });
  return indexes;
}

function systemLocalize(path) {
  const i18n = globalThis.game?.i18n;
  if (!i18n?.localize) return path;
  const value = i18n.localize(path);
  return value && value !== path ? value : path;
}

function cloneModifier(modifier) {
  return {
    ...modifier,
    artifactCounts: modifier?.artifactCounts ? { ...modifier.artifactCounts } : { d8: 0, d10: 0, d12: 0 },
    linkedInputs: Array.isArray(modifier?.linkedInputs) ? [...modifier.linkedInputs] : modifier?.linkedInputs
  };
}

function clone(value) {
  if (typeof globalThis.structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
