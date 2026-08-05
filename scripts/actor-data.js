import { ATTRIBUTES, SKILL_LABEL_TO_KEY } from "./constants.js";
import { attributeLabel, localize } from "./core/i18n.js";
import { log } from "./core/logging.js";
import { artifactCountsFromValues, formatArtifactCounts } from "./modifiers.js";
import { firstNumber, getPropertySafe, normalizeKey, parseBoolean, parseNumber, slugify } from "./utils.js";

function isActor(value) {
  return value?.documentName === "Actor" || value?.constructor?.documentName === "Actor";
}

function explicitActorCandidates(app) {
  return [
    [app?.actor, "app.actor"],
    [app?.document, "app.document"],
    [app?.object, "app.object"],
    [app?.item?.parent, "app.item.parent"],
    [app?.document?.parent, "app.document.parent"],
    [app?.object?.parent, "app.object.parent"],
    [app?.options?.actor, "app.options.actor"],
    [app?.data?.actor, "app.data.actor"]
  ];
}

function actorFromUuid(uuid) {
  if (!uuid) return null;
  try {
    if (typeof globalThis.fromUuidSync === "function") {
      const document = fromUuidSync(uuid);
      if (isActor(document)) return document;
      if (isActor(document?.actor)) return document.actor;
    }
  } catch (error) {
    log.debug("Actor UUID resolution failed", uuid, error);
  }
  return null;
}

/**
 * Resolves a token actor on the active canvas or an explicitly named scene.
 */
function actorFromToken(tokenId, sceneId = null) {
  if (!tokenId) return null;
  const activeSceneId = globalThis.canvas?.scene?.id ?? globalThis.canvas?.scene?._id ?? null;
  const canvasMatchesScene = !sceneId
    || (activeSceneId != null && String(sceneId) === String(activeSceneId));
  const canvasToken = canvasMatchesScene ? globalThis.canvas?.tokens?.get?.(tokenId) : null;
  if (isActor(canvasToken?.actor)) return { actor: canvasToken.actor, source: "speaker.token" };

  const scene = sceneId ? globalThis.game?.scenes?.get?.(sceneId) : null;
  const tokenDocument = scene?.tokens?.get?.(tokenId);
  if (isActor(tokenDocument?.actor)) return { actor: tokenDocument.actor, source: "scene.token" };
  return null;
}

/**
 * Performs an own-property lookup on data maps that may inherit prototype keys.
 */
function hasOwn(object, key) {
  return object != null && Object.prototype.hasOwnProperty.call(object, key);
}

/**
 * Resolves the exact Actor associated with a roll application without borrowing unrelated tokens.
 */
export function resolveActorFromApp(app, form = null) {
  for (const [candidate, source] of explicitActorCandidates(app)) {
    if (isActor(candidate)) return { actor: candidate, source, approximate: false };
  }

  const speaker = app?.speaker ?? app?.data?.speaker ?? app?.options?.speaker ?? null;
  const tokenId = speaker?.token ?? app?.options?.tokenId ?? form?.dataset?.tokenId;
  const sceneId = speaker?.scene ?? app?.options?.sceneId ?? form?.dataset?.sceneId;
  const tokenResolution = actorFromToken(tokenId, sceneId);
  if (tokenResolution) return { ...tokenResolution, approximate: false };

  const actorUuid = app?.options?.actorUuid ?? form?.dataset?.actorUuid;
  const uuidActor = actorFromUuid(actorUuid);
  if (uuidActor) return { actor: uuidActor, source: "actor.uuid", approximate: false };

  const actorId = speaker?.actor ?? app?.options?.actorId ?? form?.dataset?.actorId;
  if (actorId && globalThis.game?.actors?.get) {
    const actor = game.actors.get(actorId);
    if (isActor(actor)) return { actor, source: "speaker.actor", approximate: false };
  }

  log.warn("Could not resolve an actor for the roll dialog; using native form values only", {
    app: app?.constructor?.name,
    title: app?.title,
    actorId: actorId ?? null,
    tokenId: tokenId ?? null,
    actorUuid: actorUuid ?? null
  });
  return { actor: null, source: "unresolved", approximate: false, unresolved: true };
}

/**
 * Reads normalized attribute values from supported Actor data layouts.
 */
export function getActorAttributeValues(actor, currentLabel, currentValue, currentKey = null) {
  const system = actor?.system ?? {};
  const values = {};

  for (const attr of ATTRIBUTES) {
    const k = attr.key;
    values[k] = firstNumber(
      getPropertySafe(system, `attribute.${k}.value`),
      getPropertySafe(system, `attribute.${k}.max`),
      getPropertySafe(actor, `attributes.${k}.value`),
      getPropertySafe(actor, `attributes.${k}.max`),
      getPropertySafe(system, `attributes.${k}.value`),
      getPropertySafe(system, `attributes.${k}.max`),
      getPropertySafe(system, `attributes.${k}.current`),
      getPropertySafe(system, `stats.${k}.value`),
      getPropertySafe(system, `stats.${k}.max`),
      getPropertySafe(system, `${k}.value`),
      getPropertySafe(system, `${k}.max`)
    );
  }

  currentKey ??= inferCurrentAttribute(currentLabel);
  if (currentKey && values[currentKey] == null) values[currentKey] = parseNumber(currentValue, 0);
  return values;
}

/**
 * Infers an attribute key from an exact or localized label, then from safe substring aliases.
 */
export function inferCurrentAttribute(baseLabel) {
  const normalized = normalizeKey(baseLabel);
  if (!normalized) return null;

  const aliasesByAttribute = ATTRIBUTES.map((attr) => [
    attr.key,
    [attr.key, attr.fallback, attributeLabel(attr), ...(attr.aliases ?? [])]
      .map(normalizeKey)
      .filter(Boolean)
  ]);

  for (const [key, aliases] of aliasesByAttribute) {
    if (aliases.includes(normalized)) return key;
  }
  for (const [key, aliases] of aliasesByAttribute) {
    if (aliases.some((alias) => normalized.includes(alias))) return key;
  }
  return null;
}

/**
 * Resolves the current attribute from explicit roll data before consulting labels.
 */
export function resolveCurrentAttributeKey(app, form = null, baseLabel = "") {
  const explicit = [
    app?.base?.name,
    app?.base?.key,
    app?.options?.attribute,
    app?.options?.attributeKey,
    app?.data?.attribute,
    form?.dataset?.attribute,
    form?.dataset?.attributeKey,
    form?.dataset?.baseAttribute,
    form?.querySelector?.("[name='base']")?.dataset?.attribute,
    form?.querySelector?.("[name='base']")?.dataset?.key
  ];
  for (const value of explicit) {
    const normalized = normalizeKey(value);
    const match = ATTRIBUTES.find((attribute) => {
      const aliases = [attribute.key, attribute.fallback, ...(attribute.aliases ?? [])].map(normalizeKey);
      return aliases.includes(normalized);
    });
    if (match) return match.key;
  }
  return inferCurrentAttribute(baseLabel);
}

/**
 * Resolves a skill key from Actor data and localized skill labels.
 */
export function inferSkillKey(actor, skillLabel) {
  const normalized = normalizeKey(skillLabel);
  if (!normalized) return "";

  const skillData = actor?.system?.skill ?? actor?.system?.skills ?? actor?.skills ?? {};
  if (hasOwn(skillData, normalized)) return normalized;
  if (hasOwn(SKILL_LABEL_TO_KEY, normalized)) return SKILL_LABEL_TO_KEY[normalized];

  for (const [key, data] of Object.entries(skillData)) {
    if (normalizeKey(key) === normalized) return key;
    const rawLabel = data?.label;
    const localized = rawLabel && globalThis.game?.i18n?.localize ? game.i18n.localize(rawLabel) : rawLabel;
    if (normalizeKey(rawLabel) === normalized || normalizeKey(localized) === normalized) return key;
  }

  return hasOwn(SKILL_LABEL_TO_KEY, normalized) ? SKILL_LABEL_TO_KEY[normalized] : normalized;
}

/**
 * Reads Actor roll modifiers for a skill and attribute pair.
 */
export function readActorRollModifiers(actor, skillKey, attrKey, fallback = []) {
  return readActorRollModifiersByIdentifiers(actor, [skillKey, attrKey], fallback);
}

/**
 * Reads and normalizes Actor roll modifiers for an ordered identifier set.
 */
export function readActorRollModifiersByIdentifiers(actor, identifiers = [], fallback = []) {
  if (!actor || typeof actor.getRollModifierOptions !== "function") return fallback;
  identifiers = [...new Set((identifiers ?? []).filter(Boolean))];
  if (!identifiers.length) return fallback;

  let options = [];
  try {
    options = actor.getRollModifierOptions(...identifiers) ?? [];
  } catch (error) {
    log.warn("Could not read actor roll modifiers", identifiers, error);
    return fallback;
  }

  if (!Array.isArray(options)) return fallback;
  return options.map((mod, index) => {
    const rawValue = mod.value ?? mod.modifier ?? mod.bonus ?? mod.dice ?? mod.artifact ?? "";
    let artifactCounts = artifactCountsFromValues(rawValue);
    if (!Object.values(artifactCounts).some((n) => n > 0)) artifactCounts = artifactCountsFromValues(mod.name, mod.label);
    const hasArtifacts = Object.values(artifactCounts).some((n) => n > 0);
    const numericValue = hasArtifacts ? 0 : parseNumber(rawValue, 0);
    const name = mod.name ?? mod.label ?? mod.item?.name ?? `Modifier ${index + 1}`;
    const gearBonus = parseBoolean(
      mod.gearBonus
        ?? mod.gear_bonus
        ?? mod.item?.gearBonus
        ?? mod.item?.system?.gearBonus
        ?? mod.item?.system?.rollModifier?.gearBonus
        ?? mod.item?.system?.modifier?.gearBonus
        ?? mod.system?.gearBonus,
      false
    );

    const sourceUuid = mod.item?.uuid ?? mod.uuid ?? mod.sourceUuid ?? null;
    // Forbidden Lands v13 returns the originating Item id directly as `mod.id`.
    // Preserve it as source identity so DOM and actor API representations can be
    // merged into one semantic modifier instead of being shown twice.
    const sourceId = mod.item?.id ?? mod.item?._id ?? mod.itemId ?? mod.sourceId ?? mod.id ?? null;
    const ruleKey = mod.ruleKey ?? mod.key ?? mod.slug ?? null;
    const stableToken = sourceUuid || sourceId || ruleKey || `${slugify(name)}-${numericValue}-${gearBonus ? "gear" : "mod"}`;
    return {
      id: `actor-${slugify(stableToken)}-${index}`,
      name,
      value: numericValue,
      display: gearBonus && !hasArtifacts
        ? `${localize("Common.Gear", "Gear")} ${numericValue > 0 ? `+${numericValue}` : numericValue}`
        : (hasArtifacts ? formatArtifactCounts(artifactCounts) : undefined),
      artifactCounts,
      gearBonus,
      checked: mod.active !== false,
      input: null,
      origin: "actor",
      sourceUuid,
      sourceId,
      ruleKey,
      nativeName: mod.nativeName ?? null,
      explanation: mod.hint ?? mod.description ?? ""
    };
  });
}
