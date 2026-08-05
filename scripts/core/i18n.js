import { MODULE_ID } from "../constants.js";

export function key(path) {
  return `${MODULE_ID.toUpperCase().replaceAll("-", "_")}.${path}`;
}

export function localize(path, fallback = path) {
  const translationKey = key(path);
  const i18n = globalThis.game?.i18n;
  if (!i18n?.localize) return fallback;
  const value = i18n.localize(translationKey);
  return value && value !== translationKey ? value : fallback;
}

export function format(path, data = {}, fallback = path) {
  const translationKey = key(path);
  const i18n = globalThis.game?.i18n;
  if (!i18n?.format) return interpolate(fallback, data);
  const value = i18n.format(translationKey, data);
  return value && value !== translationKey ? value : interpolate(fallback, data);
}

export function attributeLabel(attribute) {
  return localize(attribute?.labelKey ?? "", attribute?.fallback ?? attribute?.key ?? "");
}

export function attributeShort(attribute) {
  return localize(attribute?.shortKey ?? "", attribute?.shortFallback ?? attribute?.key?.toUpperCase?.() ?? "");
}

function interpolate(text, data) {
  return String(text ?? "").replace(/\{([^}]+)\}/g, (_match, token) => data?.[token] ?? `{${token}}`);
}
