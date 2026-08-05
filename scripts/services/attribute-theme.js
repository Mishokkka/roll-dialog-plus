import { ATTRIBUTES } from "../constants.js";

const LEGACY_INLINE_PROPERTIES = [
  "--fblrp-window-tint",
  "--fblrp-panel-tint",
  "--fblrp-active-attr-tint"
];

/**
 * Applies the selected attribute theme to the shell and host window.
 */
export function syncAttributeTheme(shell, appWindow, attrKey = "") {
  const normalized = ATTRIBUTES.some((attribute) => attribute.key === attrKey) ? attrKey : "";
  setThemeAttribute(shell, "selectedAttr", normalized);
  setThemeAttribute(appWindow, "fblrpSelectedAttr", normalized);
  clearLegacyInlineTheme(shell);
  clearLegacyInlineTheme(appWindow);
}

/**
 * Removes module-owned attribute theme state from the shell and host window.
 */
export function clearAttributeTheme(shell, appWindow) {
  setThemeAttribute(shell, "selectedAttr", "");
  setThemeAttribute(appWindow, "fblrpSelectedAttr", "");
  clearLegacyInlineTheme(shell);
  clearLegacyInlineTheme(appWindow);
}

function setThemeAttribute(element, datasetKey, value) {
  if (!element?.dataset) return;
  if (value) element.dataset[datasetKey] = value;
  else delete element.dataset[datasetKey];
}

function clearLegacyInlineTheme(element) {
  if (!element?.style) return;
  for (const property of LEGACY_INLINE_PROPERTIES) element.style.removeProperty(property);
}
