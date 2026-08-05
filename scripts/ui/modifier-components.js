import { localize } from "../core/i18n.js";
import { partitionSpecialModifiers } from "../services/special-rolls.js";
import { escapeHtml, parseNumber, signed } from "../utils.js";

export function buildModifierBlocks(modifiers = [], specialRoll = null) {
  const { special, ordinary } = partitionSpecialModifiers(modifiers);
  const specialBlock = specialRoll && special.length
    ? `<div class="fblrp-mod-block is-special-roll">
        <div class="fblrp-special-choice-groups" data-list="special-modifiers">${buildSpecialModifierRows(special)}</div>
      </div>`
    : "";
  const ordinaryBlock = `<div class="fblrp-mod-block is-system-block ${ordinary.length ? "" : "is-hidden"}">
      <div class="fblrp-mod-list" data-list="native-modifiers">${ordinary.length ? buildNativeModifierRows(ordinary) : ""}</div>
    </div>`;
  return `${specialBlock}${ordinaryBlock}`;
}

export function renderNativeModifierList(list, modifiers = []) {
  if (!list) return;
  list.innerHTML = modifiers.length ? buildNativeModifierRows(modifiers) : "";
  list.closest(".is-system-block")?.classList.toggle("is-hidden", !modifiers.length);
}

export function renderSpecialModifierList(list, modifiers = []) {
  if (!list) return;
  list.innerHTML = modifiers.length ? buildSpecialModifierRows(modifiers) : "";
}

export function renderCustomModifierList(list, modifiers) {
  if (!list) return;
  const values = modifiers instanceof Map ? [...modifiers.values()] : [...(modifiers ?? [])];
  if (!values.length) {
    list.innerHTML = "";
    return;
  }
  list.innerHTML = values.map((modifier) => buildCustomModifierRow(modifier)).join("");
}

export function buildNativeModifierRows(modifiers = []) {
  if (!modifiers.length) return `<div class="fblrp-empty-note">${escapeHtml(localize("Modifiers.EmptySystem", "No system modifiers."))}</div>`;
  return modifiers.map((modifier) => buildNativeModifierRow(modifier)).join("");
}

export function buildSpecialModifierRows(modifiers = []) {
  const groups = new Map();
  for (const modifier of modifiers) {
    const key = modifier.choiceGroup ?? "special";
    const group = groups.get(key) ?? { label: modifier.choiceGroupLabel ?? key, modifiers: [] };
    group.modifiers.push(modifier);
    groups.set(key, group);
  }
  return [...groups.entries()].map(([key, group]) => `
    <fieldset class="fblrp-special-choice" data-special-choice="${escapeHtml(key)}">
      <legend>${escapeHtml(group.label)}</legend>
      <div class="fblrp-special-choice-grid">${group.modifiers.map((modifier) => buildNativeModifierRow(modifier, true)).join("")}</div>
    </fieldset>`).join("");
}

export function buildNativeModifierRow(modifier, special = false) {
  const inputType = modifier.choiceGroup ? "radio" : "checkbox";
  const inputName = modifier.choiceGroup ? ` name="fblrp-${escapeHtml(modifier.specialRollKey ?? "special")}-${escapeHtml(modifier.choiceGroup)}"` : "";
  const badge = modifier.houseRule && modifier.showHouseRuleBadge !== false
    ? `<small class="fblrp-house-rule">${escapeHtml(localize("SpecialRoll.HouseRule", "Table rule"))}</small>`
    : "";
  return `
    <label class="fblrp-mod-row ${modifier.gearBonus ? "is-gear-bonus" : ""} ${special ? "is-special-choice" : ""}" data-native-modifier="${escapeHtml(modifier.id)}" title="${escapeHtml(modifier.explanation ?? "")}">
      <input type="${inputType}"${inputName} data-action="native-mod" data-id="${escapeHtml(modifier.id)}" ${modifier.checked ? "checked" : ""}>
      <span class="fblrp-mod-label-wrap"><span>${escapeHtml(modifier.name)}${badge}</span></span>
      <strong>${escapeHtml(modifier.display ?? signed(modifier.value))}</strong>
    </label>`;
}

export function buildCustomModifierRow(modifier) {
  const quick = modifier.origin === "quick";
  const multiplier = modifier.kind === "armor-half";
  const labelControl = quick
    ? `<span class="fblrp-mod-label">${escapeHtml(modifier.label)}</span>`
    : `<input type="text" class="fblrp-mod-name-input" data-custom-field="label" data-id="${escapeHtml(modifier.id)}" value="${escapeHtml(modifier.label)}" aria-label="${escapeHtml(localize("Modifiers.Name", "Modifier name"))}">`;
  const valueControl = multiplier
    ? `<strong>${escapeHtml(modifier.display ?? "×0.5")}</strong>`
    : quick
      ? `<strong>${escapeHtml(modifier.display ?? signed(modifier.value))}</strong>`
      : `<input type="number" step="1" inputmode="numeric" class="fblrp-mod-value-input" data-custom-field="value" data-id="${escapeHtml(modifier.id)}" value="${parseNumber(modifier.value, 0)}" aria-label="${escapeHtml(localize("Modifiers.Value", "Modifier value"))}">`;
  return `
    <div class="fblrp-mod-row is-custom ${quick ? "is-quick" : ""} ${multiplier ? "is-multiplier" : ""}" data-custom-modifier="${escapeHtml(modifier.id)}">
      <input type="checkbox" data-action="custom-mod" data-id="${escapeHtml(modifier.id)}" ${modifier.active ? "checked" : ""} aria-label="${escapeHtml(localize("Modifiers.Enabled", "Enable modifier"))}">
      ${labelControl}
      ${valueControl}
      <button type="button" class="fblrp-row-remove" data-action="remove-custom-mod" data-id="${escapeHtml(modifier.id)}" aria-label="${escapeHtml(localize("Common.Remove", "Remove"))}" title="${escapeHtml(localize("Common.Remove", "Remove"))}"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
    </div>`;
}
