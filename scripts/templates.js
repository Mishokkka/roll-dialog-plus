import { ARTIFACT_DICE, ATTRIBUTES, MODULE_VERSION } from "./constants.js";
import { attributeShort, localize } from "./core/i18n.js";
import { parseArtifactDice } from "./modifiers.js";
import { buildModifierBlocks } from "./ui/modifier-components.js";
import { escapeHtml, parseNumber, signed } from "./utils.js";

export function buildQuickModifierHTML(groups = []) {
  return groups.map((group) => {
    const expanded = group.initiallyExpanded !== false;
    const groupLabel = localize(group.groupKey, group.groupFallback ?? group.key);
    if (group.mode === "counter") {
      return `
        <section class="fblrp-quick-group" data-group="${escapeHtml(group.key)}" data-mode="counter">
          <button type="button" class="fblrp-quick-group-title" data-action="toggle-quick-group" aria-expanded="${expanded ? "true" : "false"}">
            <span>${escapeHtml(groupLabel)}</span>
            <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>
          </button>
          <div class="fblrp-quick-grid fblrp-quick-counter-grid ${expanded ? "" : "is-collapsed"}">
            <div class="fblrp-counter-control" title="${escapeHtml(localize(group.hintKey, group.hintFallback ?? ""))}">
              <button type="button" data-action="quick-counter" data-group="${escapeHtml(group.key)}" data-delta="-1" aria-label="${escapeHtml(localize("Common.Decrease", "Decrease"))}"><i class="fa-solid fa-minus"></i></button>
              <div>
                <span>${escapeHtml(localize(group.labelKey, group.labelFallback ?? groupLabel))}</span>
                <strong data-quick-counter-value="${escapeHtml(group.key)}">0</strong>
              </div>
              <button type="button" data-action="quick-counter" data-group="${escapeHtml(group.key)}" data-delta="1" aria-label="${escapeHtml(localize("Common.Increase", "Increase"))}"><i class="fa-solid fa-plus"></i></button>
            </div>
          </div>
        </section>`;
    }

    return `
      <section class="fblrp-quick-group" data-group="${escapeHtml(group.key)}" data-mode="${escapeHtml(group.mode ?? "toggle")}">
        <button type="button" class="fblrp-quick-group-title" data-action="toggle-quick-group" aria-expanded="${expanded ? "true" : "false"}">
          <span>${escapeHtml(groupLabel)}</span>
          <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>
        </button>
        <div class="fblrp-quick-grid ${expanded ? "" : "is-collapsed"}">
          ${(group.items ?? []).map((item) => {
            const label = localize(item.labelKey, item.fallback ?? item.id);
            const hint = localize(item.hintKey, item.hintFallback ?? "");
            return `
              <button type="button"
                class="fblrp-quick-button ${item.value > 0 ? "is-positive" : item.value < 0 ? "is-negative" : ""}"
                data-action="quick-mod"
                data-id="${escapeHtml(item.id)}"
                data-group="${escapeHtml(group.key)}"
                data-mode="${escapeHtml(group.mode ?? "toggle")}"
                data-label="${escapeHtml(label)}"
                data-value="${parseNumber(item.value, 0)}"
                data-kind="${escapeHtml(item.kind ?? "numeric")}"
                data-factor="${escapeHtml(item.factor ?? "")}"
                data-display="${escapeHtml(item.display ?? signed(item.value))}"
                title="${escapeHtml(hint)}">
                <span>${escapeHtml(label)}</span>
                <strong>${escapeHtml(item.display ?? signed(item.value))}</strong>
              </button>`;
          }).join("")}
        </div>
      </section>`;
  }).join("");
}

export function buildShellHTML({
  baseLabel,
  skillLabel,
  baseValue,
  skillValue,
  gearValue,
  artifactValue,
  modifierValue,
  attrValues,
  selectedAttr,
  nativeSystemModifiers,
  canUseChance = false,
  showPushPreview = true,
  quickGroups = [],
  specialRoll = null,
  quickPanelId = "fblrp-quick-panel"
}) {
  const attributeCards = ATTRIBUTES.map((attr) => {
    const value = attrValues[attr.key];
    const disabled = value == null;
    const active = selectedAttr === attr.key;
    return `
      <button type="button" class="fblrp-attr-card ${active ? "is-active" : ""}" data-action="select-attribute" data-attr="${escapeHtml(attr.key)}" ${disabled ? "disabled" : ""} aria-pressed="${active ? "true" : "false"}">
        <span class="fblrp-attr-short">${escapeHtml(attributeShort(attr))}</span>
        <strong>${disabled ? "?" : escapeHtml(value)}</strong>
      </button>`;
  }).join("");

  const artifactCounts = parseArtifactDice(artifactValue);
  return `
    <div class="fblrp-shell" data-module-version="${MODULE_VERSION}" data-roll-type="skill" ${selectedAttr ? `data-selected-attr="${escapeHtml(selectedAttr)}"` : ""} ${specialRoll?.key ? `data-special-roll="${escapeHtml(specialRoll.key)}"` : ""}>
      <section class="fblrp-attribute-strip fblrp-attributes ${selectedAttr ? "" : "is-native-attribute"}" aria-label="${escapeHtml(localize("Common.Attribute", "Attribute"))}">
        <div class="fblrp-attr-grid">${attributeCards}</div>
      </section>

      <main class="fblrp-two-columns">
        <section class="fblrp-section fblrp-dice-section">
          <div class="fblrp-section-title"><span>${escapeHtml(localize("Common.Dice", "Dice"))}</span></div>
          ${buildDiceRow("base", baseLabel, baseValue)}
          ${buildDiceRow("skill", skillLabel, skillValue)}
          ${buildDiceRow("gear", localize("Common.Gear", "Gear"), gearValue)}
          ${buildArtifactSection(artifactCounts)}
        </section>

        <section class="fblrp-section fblrp-modifiers-section">
          ${buildModifierBlocks(nativeSystemModifiers, specialRoll)}
          ${buildCustomControlsHTML({
            modifierValue,
            quickPanelId
          })}
        </section>
      </main>

      ${canUseChance ? buildChancePanelHTML(showPushPreview) : ""}
      <div class="fblrp-zero-warning is-hidden" data-field="zero-warning"><i class="fa-solid fa-triangle-exclamation"></i> ${escapeHtml(localize("Dialog.ZeroDiceWarning", "No dice: Forbidden Lands will reject this roll."))}</div>
      ${buildFooterHTML(canUseChance)}
      ${buildQuickPanelHTML(quickGroups, quickPanelId)}
    </div>`;
}

export function buildArmorShellHTML({
  armorValue,
  artifactValue,
  nativeSystemModifiers,
  canUseChance = false,
  showPushPreview = true,
  quickGroups = [],
  quickPanelId = "fblrp-quick-panel"
}) {
  const artifactCounts = parseArtifactDice(artifactValue);
  return `
    <div class="fblrp-shell is-armor-roll" data-module-version="${MODULE_VERSION}" data-roll-type="armor">
      <main class="fblrp-two-columns fblrp-armor-columns">
        <section class="fblrp-section fblrp-dice-section">
          <div class="fblrp-section-title"><span>${escapeHtml(localize("Armor.Title", "Armor roll"))}</span></div>
          ${buildDiceRow("armor", localize("Armor.Armor", "Armor"), armorValue, true)}
          ${buildArtifactSection(artifactCounts)}
        </section>

        <section class="fblrp-section fblrp-modifiers-section">
          ${buildModifierBlocks(nativeSystemModifiers, null)}
          ${buildCustomControlsHTML({
            modifierValue: 0,
            quickPanelId
          })}
        </section>
      </main>

      ${canUseChance ? buildChancePanelHTML(showPushPreview) : ""}
      <div class="fblrp-zero-warning is-hidden" data-field="zero-warning"><i class="fa-solid fa-triangle-exclamation"></i> ${escapeHtml(localize("Dialog.ZeroDiceWarning", "No dice: Forbidden Lands will reject this roll."))}</div>
      ${buildFooterHTML(canUseChance)}
      ${buildQuickPanelHTML(quickGroups, quickPanelId)}
    </div>`;
}

function buildCustomControlsHTML({ modifierValue, quickPanelId }) {
  return `
    <div class="fblrp-mod-block fblrp-custom-block">
      <div class="fblrp-mod-list" data-list="custom-modifiers"></div>
      <div class="fblrp-modifier-toolbar">
        <button type="button" class="fblrp-small-button" data-action="toggle-quick-panel" aria-controls="${escapeHtml(quickPanelId)}" aria-expanded="false">
          <i class="fa-solid fa-sliders" aria-hidden="true"></i> ${escapeHtml(localize("Common.Quick", "Quick"))}
        </button>
        <button type="button" class="fblrp-link-button" data-action="add-custom-modifier"><i class="fa-solid fa-plus"></i> ${escapeHtml(localize("Modifiers.AddCustom", "Custom"))}</button>
        <span class="fblrp-modifier-total" title="${escapeHtml(localize("Modifiers.Total", "Total modifier"))}"><span aria-hidden="true">Σ</span><strong data-field="modifier-total">${escapeHtml(signed(modifierValue))}</strong></span>
      </div>
    </div>`;
}

function buildFooterHTML(canUseChance = false) {
  const rollLabel = localize("Common.Roll", "Roll").toUpperCase();
  return `
    <footer class="fblrp-footer">
      <div class="fblrp-footer-tools">
        ${canUseChance ? `<button type="button" class="fblrp-tool-button fblrp-chance-button" data-action="calculate-chance" aria-label="${escapeHtml(localize("Chance.Calculate", "Calculate success chance"))}" title="${escapeHtml(localize("Chance.Calculate", "Calculate success chance"))}"><i class="fa-solid fa-chart-simple" aria-hidden="true"></i></button>` : ""}
      </div>
      <button type="button" class="fblrp-roll-button" data-action="roll"><i class="fa-solid fa-dice" aria-hidden="true"></i> ${escapeHtml(rollLabel)}</button>
      <button type="button" class="fblrp-cancel-button" data-action="cancel"><i class="fa-solid fa-xmark"></i> ${escapeHtml(localize("Common.Cancel", "Cancel"))}</button>
    </footer>`;
}

function buildDiceRow(name, label, value, clamp = false) {
  return `
    <div class="fblrp-dice-row" data-dice-row="${escapeHtml(name)}">
      <label data-field="${escapeHtml(name)}-label">${escapeHtml(label)}</label>
      <div class="fblrp-stepper">
        <button type="button" data-action="step" data-target="${escapeHtml(name)}" data-delta="-1" aria-label="${escapeHtml(localize("Common.Decrease", "Decrease"))}"><i class="fa-solid fa-minus"></i></button>
        <input type="number" min="${clamp ? "0" : "0"}" step="1" inputmode="numeric" data-input="${escapeHtml(name)}" value="${Math.max(0, parseNumber(value, 0))}">
        <button type="button" data-action="step" data-target="${escapeHtml(name)}" data-delta="1" aria-label="${escapeHtml(localize("Common.Increase", "Increase"))}"><i class="fa-solid fa-plus"></i></button>
      </div>
    </div>`;
}

function buildArtifactSection(artifactCounts) {
  const rows = ARTIFACT_DICE.map((die) => `
    <div class="fblrp-artifact-die ${artifactCounts[die] ? "is-active" : ""}" data-artifact-die="${die}" title="${die.replace("d", "D")} ${escapeHtml(localize("Common.ArtifactDie", "artifact die"))}">
      <span class="fblrp-die-icon" aria-hidden="true">${die.replace("d", "D")}</span>
      <input type="number" min="0" step="1" inputmode="numeric" data-artifact-die-input="${die}" value="${artifactCounts[die] || ""}" placeholder="0" aria-label="${die.replace("d", "D")} ${escapeHtml(localize("Common.ArtifactDiceCount", "artifact dice count"))}">
    </div>`).join("");
  return `
    <div class="fblrp-artifacts" data-artifact-counts='${escapeHtml(JSON.stringify(artifactCounts))}'>
      <div class="fblrp-artifacts-label">${escapeHtml(localize("Common.ArtifactDice", "Artifact dice"))}</div>
      <div class="fblrp-artifact-row">${rows}</div>
    </div>`;
}

function buildChancePanelHTML(showPushPreview) {
  return `
    <section class="fblrp-chance-panel is-hidden" data-chance-panel aria-live="polite">
      <div class="fblrp-chance-panel__header">
        <strong>${escapeHtml(localize("Chance.Analysis", "Probability analysis"))}</strong>
        <span data-chance="pool">0 dice</span>
      </div>
      <div class="fblrp-chance-metrics">
        <div><span>${escapeHtml(localize("Chance.Now", "Now"))}</span><strong data-chance="now">0%</strong></div>
        ${showPushPreview ? `<div><span>${escapeHtml(localize("Chance.AfterPush", "After push"))}</span><strong data-chance="push">0%</strong></div>` : ""}
        <div><span>${escapeHtml(localize("Chance.Expected", "Expected successes"))}</span><strong data-chance="expected">0</strong></div>
        ${showPushPreview ? `<div><span>${escapeHtml(localize("Chance.AttributeRisk", "Attribute risk"))}</span><strong data-chance="attribute-risk">0%</strong></div><div><span>${escapeHtml(localize("Chance.GearRisk", "Gear risk"))}</span><strong data-chance="gear-risk">0%</strong></div>` : ""}
      </div>
      <div class="fblrp-distribution" data-chance="distribution"></div>
    </section>`;
}

function buildQuickPanelHTML(quickGroups, quickPanelId) {
  return `
    <div class="fblrp-quick-backdrop" data-action="close-quick-panel"></div>
    <aside class="fblrp-quick-panel" id="${escapeHtml(quickPanelId)}" role="dialog" aria-modal="true" aria-hidden="true" tabindex="-1" aria-label="${escapeHtml(localize("Quick.Title", "Quick modifiers"))}">
      <div class="fblrp-quick-header">
        <span><i class="fa-solid fa-sliders" aria-hidden="true"></i> ${escapeHtml(localize("Quick.Title", "Quick modifiers"))}</span>
        <button type="button" class="fblrp-icon-button" data-action="close-quick-panel" aria-label="${escapeHtml(localize("Common.Close", "Close"))}" title="${escapeHtml(localize("Common.Close", "Close"))}"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
      </div>
      <div class="fblrp-quick-groups">${buildQuickModifierHTML(quickGroups)}</div>
    </aside>`;
}
