/**
 * Normalizes Foundry HTML wrapper values to an HTMLElement.
 */
export function toHTMLElement(html) {
  if (html instanceof HTMLElement) return html;
  if (html?.jquery && html[0] instanceof HTMLElement) return html[0];
  if (Array.isArray(html) && html[0] instanceof HTMLElement) return html[0];
  return null;
}

/**
 * Converts arbitrary text to a stable lowercase identifier fragment.
 */
export function slugify(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "") || "modifier";
}

/**
 * Normalizes labels and identifiers for tolerant comparison.
 */
export function normalizeKey(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-zа-яё0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Escapes text for safe insertion into generated HTML.
 */
export function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = String(value ?? "");
  return div.innerHTML;
}

/**
 * Parses localized signed numeric input with a fallback.
 */
export function parseNumber(value, fallback = 0) {
  const normalized = String(value ?? "")
    .trim()
    .replace(/[−–—﹣－]/g, "-")
    .replace(/[＋﹢]/g, "+");
  const n = Number.parseInt(normalized, 10);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Formats a number with an explicit plus sign when positive.
 */
export function signed(value) {
  const n = parseNumber(value, 0);
  return n > 0 ? `+${n}` : `${n}`;
}

/**
 * Reads normalized label text from a form selector.
 */
export function labelText(form, selector, fallback) {
  const label = form.querySelector(selector);
  return (label?.textContent ?? fallback).replace(/[:：]/g, "").trim() || fallback;
}

/**
 * Returns a named input from a native roll form.
 */
export function inputByName(form, name) {
  return form.querySelector(`input[name="${name}"], input#${name}`);
}

/**
 * Dispatches the native input and change event pair.
 */
export function dispatchNativeInput(input) {
  if (!input) return;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

/**
 * Reads a dotted object path without throwing.
 */
export function getPropertySafe(object, path) {
  if (!object || !path) return undefined;
  if (globalThis.foundry?.utils?.getProperty) return foundry.utils.getProperty(object, path);
  return path.split(".").reduce((o, k) => o?.[k], object);
}

/**
 * Returns the first nonblank finite numeric candidate.
 */
export function firstNumber(...values) {
  for (const value of values) {
    if (value == null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * Parses common boolean representations with a fallback.
 */
export function parseBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const text = String(value ?? "").trim().toLowerCase();
  if (["true", "1", "yes", "y", "on"].includes(text)) return true;
  if (["false", "0", "no", "n", "off", ""].includes(text)) return false;
  return fallback;
}
