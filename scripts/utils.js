export function toHTMLElement(html) {
  if (html instanceof HTMLElement) return html;
  if (html?.jquery && html[0] instanceof HTMLElement) return html[0];
  if (Array.isArray(html) && html[0] instanceof HTMLElement) return html[0];
  return null;
}

export function slugify(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "") || "modifier";
}

export function normalizeKey(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-zа-яё0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "");
}

export function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = String(value ?? "");
  return div.innerHTML;
}

export function parseNumber(value, fallback = 0) {
  const normalized = String(value ?? "")
    .trim()
    .replace(/[−–—﹣－]/g, "-")
    .replace(/[＋﹢]/g, "+");
  const n = Number.parseInt(normalized, 10);
  return Number.isFinite(n) ? n : fallback;
}

export function signed(value) {
  const n = parseNumber(value, 0);
  return n > 0 ? `+${n}` : `${n}`;
}

export function labelText(form, selector, fallback) {
  const label = form.querySelector(selector);
  return (label?.textContent ?? fallback).replace(/[:：]/g, "").trim() || fallback;
}

export function inputByName(form, name) {
  return form.querySelector(`input[name="${name}"], input#${name}`);
}

export function dispatchNativeInput(input) {
  if (!input) return;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

export function getPropertySafe(object, path) {
  if (!object || !path) return undefined;
  if (globalThis.foundry?.utils?.getProperty) return foundry.utils.getProperty(object, path);
  return path.split(".").reduce((o, k) => o?.[k], object);
}

export function firstNumber(...values) {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export function parseBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const text = String(value ?? "").trim().toLowerCase();
  if (["true", "1", "yes", "y", "on"].includes(text)) return true;
  if (["false", "0", "no", "n", "off", ""].includes(text)) return false;
  return fallback;
}
