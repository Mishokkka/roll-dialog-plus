import { MODULE_ID } from "../constants.js";

/**
 * Builds a fully qualified module localization key.
 */
export function key(path) {
  return `${MODULE_ID.toUpperCase().replaceAll("-", "_")}.${path}`;
}

/**
 * Localizes a module string with a deterministic fallback.
 */
export function localize(path, fallback = path) {
  const translationKey = key(path);
  const i18n = globalThis.game?.i18n;
  if (!i18n?.localize) return fallback;
  const value = i18n.localize(translationKey);
  return value && value !== translationKey ? value : fallback;
}

/**
 * Formats a localized module string with interpolation fallback.
 */
export function format(path, data = {}, fallback = path) {
  const translationKey = key(path);
  const i18n = globalThis.game?.i18n;
  if (!i18n?.format) return interpolate(fallback, data);
  const value = i18n.format(translationKey, data);
  return value && value !== translationKey ? value : interpolate(fallback, data);
}

/**
 * Returns the localized long label for an attribute descriptor.
 */
export function attributeLabel(attribute) {
  return localize(attribute?.labelKey ?? "", attribute?.fallback ?? attribute?.key ?? "");
}

/**
 * Returns the localized short label for an attribute descriptor.
 */
export function attributeShort(attribute) {
  return localize(attribute?.shortKey ?? "", attribute?.shortFallback ?? attribute?.key?.toUpperCase?.() ?? "");
}

function interpolate(text, data) {
  return String(text ?? "").replace(/\{([^}]+)\}/g, (_match, token) => data?.[token] ?? `{${token}}`);
}
