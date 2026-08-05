import { ARTIFACT_DICE, ATTRIBUTES, SYSTEM_ID } from "./constants.js";
import { getActorAttributeValues, inferSkillKey, readActorRollModifiersByIdentifiers, resolveActorFromApp, resolveCurrentAttributeKey } from "./actor-data.js";
import { attributeLabel, attributeShort, format, localize } from "./core/i18n.js";
import { log } from "./core/logging.js";
import { SETTINGS, getSetting } from "./core/settings.js";
import { activeArtifactModifierCounts, activeNumericModifierSum, addArtifactCounts, buildArtifactValue, calculateModifierResidual, mergeSystemModifiers, parseArtifactDice, readNativeSystemModifiers } from "./modifiers.js";
import { calculateChanceAnalysis, describeChancePool, formatChance, formatExpected, totalDiceCount, totalPositiveDiceCount } from "./probability.js";
import { activeCustomModifierSum, activeGearBonusTotal, calculateArmorDiceTotal, calculateSkillModifierTotal } from "./model/roll-math.js";
import { NativeFormBridge } from "./services/native-form-bridge.js";
import { clearAttributeTheme, syncAttributeTheme } from "./services/attribute-theme.js";
import { detectRollType, inferArmorDiceValue } from "./services/roll-detection.js";
import { installLifecycleRestoration } from "./services/lifecycle-restoration.js";
import { submitNativeRoll } from "./services/roll-submitter.js";
import { getQuickModifierGroups } from "./services/quick-registry.js";
import { applySpecialRollProfile, buildRollIdentifiers, getSpecialRollView, partitionSpecialModifiers, resolveSpecialRollProfile } from "./services/special-rolls.js";
import { buildArmorShellHTML, buildShellHTML } from "./templates.js";
import { renderCustomModifierList, renderNativeModifierList, renderSpecialModifierList } from "./ui/modifier-components.js";
import { escapeHtml, inputByName, labelText, parseNumber, signed, toHTMLElement } from "./utils.js";

const PROBABILITY_PREVIEW_LIMIT = 200;
const PROBABILITY_CACHE_LIMIT = 120;
const probabilityAnalysisCache = new Map();

export function isTargetRollDialog(app, html) {
  if (globalThis.game?.system?.id && game.system.id !== SYSTEM_ID) return false;
  const root = toHTMLElement(html);
  if (!root) return false;
  const form = findRollForm(root);
  if (!form) return false;
  if (form.dataset.fblrpPatched) return false;
  if (app?.options?.type === "spell" || form.querySelector(".spell-option, .spend-willpower")) {
    log.debug("Skipping spell roll dialog; this module only manages standard and armor rolls");
    return false;
  }

  const hasDiceField = ["base", "skill", "gear"].some((name) => inputByName(form, name));
  const hasRollControl = !!form.querySelector("button[type='submit'], #submit, [data-action='roll']");
  if (!hasDiceField || !hasRollControl) {
    log.debug("Rejected superficially matching form", { app: app?.constructor?.name, hasDiceField, hasRollControl });
    return false;
  }
  return true;
}

export function patchRollDialog(app, html) {
  if (!getSetting(SETTINGS.ENABLED, true) || !isTargetRollDialog(app, html)) return;

  const root = toHTMLElement(html);
  const form = findRollForm(root);
  if (!form || form.dataset.fblrpPatching === "true") return;
  form.dataset.fblrpPatching = "true";
  let transaction = null;

  try {
    const prepared = prepareRollDialogPatch(app, form);
    transaction = commitRollDialogPatch(prepared);

    if (prepared.armorRoll) {
      setupArmorShell({
        app,
        form,
        bridge: transaction.bridge,
        inputs: prepared.inputs,
        armorValue: prepared.armorValue,
        nativeSystemModifiers: prepared.prepareContext.nativeSystemModifiers,
        domModifiers: prepared.domModifiers,
        actor: prepared.actor,
        actorResolution: prepared.actorResolution,
        quickGroups: prepared.prepareContext.quickGroups,
        ...prepared.uiOptions
      });
    } else {
      setupSkillShell({
        app,
        form,
        bridge: transaction.bridge,
        inputs: prepared.inputs,
        baseLabel: prepared.baseLabel,
        skillLabel: prepared.skillLabel,
        attrValues: prepared.attrValues,
        selectedAttr: prepared.selectedAttr,
        nativeSystemModifiers: prepared.prepareContext.nativeSystemModifiers,
        domModifiers: prepared.domModifiers,
        actor: prepared.actor,
        actorResolution: prepared.actorResolution,
        skillKey: prepared.skillKey,
        specialRollProfile: prepared.prepareContext.specialRollProfile,
        specialRoll: prepared.prepareContext.specialRoll,
        quickGroups: prepared.prepareContext.quickGroups,
        ...prepared.uiOptions
      });
    }

    transaction.lifecycleCleanup = installLifecycleRestoration({
      app,
      appWindow: prepared.appWindow,
      form,
      shell: transaction.shell,
      bridge: transaction.bridge
    });
    form.dataset.fblrpPatched = "true";
    delete form.dataset.fblrpPatching;
  } catch (error) {
    rollbackRollDialogPatch(transaction, form);
    delete form.dataset.fblrpPatching;
    delete form.dataset.fblrpPatched;
    throw error;
  }
}

function prepareRollDialogPatch(app, form) {
  const appWindow = form.closest(".window-app, .application");
  const actorResolution = resolveActorFromApp(app, form);
  const actor = actorResolution.actor;
  const title = form.querySelector("h2 span")?.textContent?.trim()
    || form.querySelector("h2")?.textContent?.trim()
    || app?.title
    || appWindow?.querySelector(".window-title")?.textContent?.trim()
    || localize("Common.Roll", "Roll");
  const inputs = {
    base: inputByName(form, "base"),
    skill: inputByName(form, "skill"),
    gear: inputByName(form, "gear"),
    artifact: inputByName(form, "artifact"),
    modifier: inputByName(form, "modifier")
  };
  const nativeSubmit = form.querySelector("button[type='submit'], #submit");
  const nativeCancel = form.querySelector("button[type='reset'], #cancel");
  const baseLabel = labelText(form, "label[for='base']", localize("Common.Attribute", "Attribute"));
  const skillLabel = labelText(form, "label[for='skill']", title);
  const skillKey = inferSkillKey(actor, skillLabel);
  const selectedAttr = resolveCurrentAttributeKey(app, form, baseLabel);
  const attrValues = getActorAttributeValues(actor, baseLabel, inputs.base?.value, selectedAttr);
  const rollType = detectRollType({ app, form, title, baseLabel, skillLabel, skillKey });
  const armorRoll = rollType === "armor";
  const domModifiers = readNativeSystemModifiers(form);
  const specialRollProfile = armorRoll ? null : resolveSpecialRollProfile({ app, form, title, skillKey, nativeModifiers: domModifiers });
  const rollIdentifiers = armorRoll
    ? ["armor"]
    : buildRollIdentifiers(specialRollProfile, skillKey, selectedAttr, { app, form });
  const actorModifiers = readActorRollModifiersByIdentifiers(actor, rollIdentifiers, []);
  let nativeSystemModifiers = mergeSystemModifiers(domModifiers, actorModifiers);
  nativeSystemModifiers = applySpecialRollProfile(nativeSystemModifiers, specialRollProfile);
  const specialRoll = getSpecialRollView(specialRollProfile);
  const quickGroups = getQuickModifierGroups(armorRoll ? "armor" : "skill");
  const corePrepareState = {
    nativeSystemModifiers: cloneModifierList(nativeSystemModifiers),
    quickGroups: cloneQuickGroups(quickGroups)
  };
  const prepareContext = {
    app,
    form,
    actor,
    actorResolution,
    rollType: armorRoll ? "armor" : (specialRollProfile?.key ?? "skill"),
    specialRollProfile,
    specialRoll,
    rollIdentifiers,
    skillKey,
    skillLabel,
    selectedAttribute: selectedAttr,
    nativeSystemModifiers: cloneModifierList(corePrepareState.nativeSystemModifiers),
    quickGroups: cloneQuickGroups(corePrepareState.quickGroups)
  };
  try {
    globalThis.Hooks?.callAll?.("fblRollDialogPlusPrepare", prepareContext);
  } catch (error) {
    prepareContext.nativeSystemModifiers = cloneModifierList(corePrepareState.nativeSystemModifiers);
    prepareContext.quickGroups = cloneQuickGroups(corePrepareState.quickGroups);
    log.warn("A prepare hook failed; continuing with the validated core context", error);
  }
  if (!Array.isArray(prepareContext.nativeSystemModifiers)) {
    log.warn("A prepare hook returned an invalid modifier list; using the core list instead");
    prepareContext.nativeSystemModifiers = cloneModifierList(corePrepareState.nativeSystemModifiers);
  }
  if (!Array.isArray(prepareContext.quickGroups)) {
    log.warn("A prepare hook returned invalid quick groups; using the core groups instead");
    prepareContext.quickGroups = cloneQuickGroups(corePrepareState.quickGroups);
  }

  const canUseChance = !!globalThis.game?.user?.isGM;
  const uiOptions = {
    canUseChance,
    showPushPreview: canUseChance && getSetting(SETTINGS.SHOW_PUSH_PREVIEW, true)
  };
  let armorValue = 0;
  let shellHtml;
  const quickPanelId = uniqueId("fblrp-quick-panel");

  if (armorRoll) {
    armorValue = inferArmorDiceValue({ ...inputs, baseLabel, skillLabel, title });
    shellHtml = buildArmorShellHTML({
      armorValue,
      artifactValue: inputs.artifact?.value,
      nativeSystemModifiers: prepareContext.nativeSystemModifiers,
      quickGroups: prepareContext.quickGroups,
      quickPanelId,
      ...uiOptions
    });
  } else {
    shellHtml = buildShellHTML({
      baseLabel,
      skillLabel,
      baseValue: inputs.base?.value,
      skillValue: inputs.skill?.value,
      gearValue: inputs.gear?.value,
      artifactValue: inputs.artifact?.value,
      modifierValue: inputs.modifier?.value,
      attrValues,
      selectedAttr,
      nativeSystemModifiers: prepareContext.nativeSystemModifiers,
      quickGroups: prepareContext.quickGroups,
      specialRoll: prepareContext.specialRoll,
      quickPanelId,
      ...uiOptions
    });
  }

  const shellContainer = document.createElement("div");
  shellContainer.innerHTML = shellHtml;
  const shell = shellContainer.firstElementChild;
  validatePreparedShell(shell, armorRoll ? "armor" : "skill");

  return {
    app,
    form,
    appWindow,
    actor,
    actorResolution,
    title,
    inputs,
    nativeSubmit,
    nativeCancel,
    baseLabel,
    skillLabel,
    skillKey,
    selectedAttr,
    attrValues,
    armorRoll,
    armorValue,
    domModifiers,
    prepareContext,
    uiOptions,
    shell
  };
}

function commitRollDialogPatch(prepared) {
  const { app, form, appWindow, shell, inputs, nativeSubmit, nativeCancel, domModifiers, armorRoll, uiOptions } = prepared;
  const originalChildren = [...form.childNodes];
  const nativeWrapper = document.createElement("div");
  nativeWrapper.className = "fblrp-native";
  nativeWrapper.setAttribute("aria-hidden", "true");
  const bridge = new NativeFormBridge({ app, form, inputs, nativeSubmit, nativeCancel, nativeModifiers: domModifiers });
  const addedClasses = ["fblrp-shell-window"];
  if (armorRoll) addedClasses.push("fblrp-armor-window");

  try {
    for (const child of originalChildren) nativeWrapper.appendChild(child);
    form.appendChild(nativeWrapper);
    form.insertBefore(shell, nativeWrapper);
    appWindow?.classList.add(...addedClasses);
    syncAttributeTheme(shell, appWindow, shell.dataset.selectedAttr ?? "");
    bridge.disableNativeOptions();
    return { bridge, shell, nativeWrapper, originalChildren, appWindow, addedClasses, lifecycleCleanup: null };
  } catch (error) {
    const transaction = { bridge, shell, nativeWrapper, originalChildren, appWindow, addedClasses, lifecycleCleanup: null };
    rollbackRollDialogPatch(transaction, form);
    throw error;
  }
}

function rollbackRollDialogPatch(transaction, form) {
  if (!transaction) return;
  try { transaction.lifecycleCleanup?.(); } catch (_error) { /* no-op */ }
  try { transaction.bridge?.restore({ force: true }); } catch (_error) { /* no-op */ }
  try { transaction.shell?.remove?.(); } catch (_error) { /* no-op */ }
  try {
    for (const child of transaction.originalChildren ?? []) form.appendChild(child);
    transaction.nativeWrapper?.remove?.();
  } catch (_error) { /* no-op */ }
  transaction.appWindow?.classList.remove(...(transaction.addedClasses ?? []));
  clearAttributeTheme(transaction.shell, transaction.appWindow);
}

function validatePreparedShell(shell, rollType) {
  if (!shell?.matches?.(`.fblrp-shell[data-roll-type='${rollType}']`)) throw new Error(`Prepared ${rollType} shell is invalid`);
  if (!shell.querySelector("[data-action='roll']") || !shell.querySelector("[data-action='cancel']")) {
    throw new Error(`Prepared ${rollType} shell lacks required actions`);
  }
}

function setupSkillShell({
  app,
  form,
  bridge,
  inputs,
  baseLabel,
  skillLabel,
  attrValues,
  selectedAttr,
  nativeSystemModifiers,
  domModifiers,
  actor,
  actorResolution,
  skillKey,
  specialRollProfile,
  specialRoll,
  quickGroups,
  canUseChance,
  showPushPreview
}) {
  const shell = form.querySelector(".fblrp-shell[data-roll-type='skill']");
  if (!shell) throw new Error("Skill shell was committed without its root element");
  const ui = createUi(shell);
  const initial = {
    selectedAttr,
    base: Math.max(0, parseNumber(inputs.base?.value, 0)),
    skill: Math.max(0, parseNumber(inputs.skill?.value, 0)),
    gear: Math.max(0, parseNumber(inputs.gear?.value, 0)),
    artifactCounts: parseArtifactDice(inputs.artifact?.value),
    nativeSystemModifiers: cloneModifierList(nativeSystemModifiers)
  };
  const state = {
    shell,
    selectedAttr,
    originalAttr: selectedAttr,
    baseLabel,
    skillLabel,
    skillKey,
    specialRollProfile,
    specialRoll,
    modifierResidual: calculateModifierResidual(inputs.modifier?.value, nativeSystemModifiers),
    customModifiers: new Map(),
    quickCounters: new Map(),
    nativeSystemModifiers,
    domModifiers,
    manualArtifactCounts: { ...initial.artifactCounts },
    canUseChance: !!canUseChance,
    showPushPreview: !!showPushPreview,
    chanceRevealed: false,
    quickGroups,

    isSubmitting: false,
    submissionCleanup: null,
    probabilityFrame: null,
    probabilityCancel: null,
    initial
  };

  function finalModifierTotal() {
    return calculateSkillModifierTotal({
      residual: state.modifierResidual,
      systemModifiers: state.nativeSystemModifiers,
      customModifiers: state.customModifiers
    });
  }

  function gearBonusTotal() {
    return activeGearBonusTotal(state.nativeSystemModifiers);
  }

  function systemArtifactCounts() {
    return activeArtifactModifierCounts(state.nativeSystemModifiers);
  }

  function combinedArtifactCounts() {
    return addArtifactCounts(state.manualArtifactCounts, systemArtifactCounts());
  }

  function currentChancePayload() {
    return {
      base: readNonNegative(ui.input("base")),
      skill: readNonNegative(ui.input("skill")),
      gear: readNonNegative(ui.input("gear")) + gearBonusTotal(),
      modifier: finalModifierTotal(),
      artifactCounts: combinedArtifactCounts()
    };
  }

  function renderNativeModifiers() {
    const { special, ordinary } = partitionSpecialModifiers(state.nativeSystemModifiers);
    renderNativeModifierList(ui.el('[data-list="native-modifiers"]'), ordinary);
    renderSpecialModifierList(ui.el('[data-list="special-modifiers"]'), special);
  }

  function renderArtifactDice() {
    renderArtifacts(shell, state.manualArtifactCounts);
  }

  function updateTotals({ revealChance = false } = {}) {
    const base = sanitizeDiceInput(ui.input("base"));
    const skill = sanitizeDiceInput(ui.input("skill"));
    const manualGear = sanitizeDiceInput(ui.input("gear"));
    const gear = manualGear + gearBonusTotal();
    const modifierTotal = finalModifierTotal();

    ui.setText('[data-field="modifier-total"]', signed(modifierTotal));
    bridge.setValue("base", base);
    bridge.setValue("skill", skill);
    bridge.setNativeGearValue(manualGear);
    bridge.setValue("gear", gear);
    bridge.setValue("artifact", buildArtifactValue(combinedArtifactCounts()));
    bridge.setValue("modifier", modifierTotal);
    bridge.syncSyntheticGearBonuses(state.nativeSystemModifiers);

    const payload = currentChancePayload();
    updateZeroDiceWarning(ui, payload);
    if (state.canUseChance && (state.chanceRevealed || revealChance)) {
      if (revealChance) updateChanceAnalysis(ui, payload, state.showPushPreview, true);
      else scheduleChanceAnalysis(state, ui, payload, state.showPushPreview);
    }
    return payload;
  }

  const shared = createSharedRollController({
    state,
    shell,
    ui,
    armorMode: false,
    updateTotals,
    customLabelKey: "Modifiers.CustomDefault",
    customLabelFallback: "Custom modifier"
  });

  function applySelectedAttribute() {
    const attribute = ATTRIBUTES.find((entry) => entry.key === state.selectedAttr);
    if (!attribute) return false;
    return bridge.applySelectedAttribute({ key: attribute.key, label: attributeLabel(attribute) }, ui.input("base")?.value);
  }

  function selectAttribute(attrKey, { skipModifierRefresh = false, skipTotals = false } = {}) {
    const attribute = ATTRIBUTES.find((entry) => entry.key === attrKey);
    const value = attrValues[attrKey];
    if (!attribute || value == null) return false;

    state.selectedAttr = attrKey;
    syncAttributeTheme(shell, form.closest(".window-app, .application"), attrKey);
    ui.setInput("base", Math.max(0, parseNumber(value, 0)));
    ui.all(".fblrp-attr-card").forEach((card) => {
      const active = card.dataset.attr === attrKey;
      card.classList.toggle("is-active", active);
      card.setAttribute("aria-pressed", active ? "true" : "false");
    });
    shell.querySelector(".fblrp-attributes")?.classList.remove("is-native-attribute");

    if (!skipModifierRefresh) {
      const identifiers = buildRollIdentifiers(state.specialRollProfile, state.skillKey, attrKey, { app, form });
      const refreshedActorModifiers = readActorRollModifiersByIdentifiers(actor, identifiers, []);
      const mergedModifiers = mergeSystemModifiers(state.domModifiers, refreshedActorModifiers, state.nativeSystemModifiers);
      state.nativeSystemModifiers = applySpecialRollProfile(mergedModifiers, state.specialRollProfile, state.nativeSystemModifiers);
      renderNativeModifiers();
    }

    form.dataset.fblrpSelectedAttribute = attrKey;
    form.dataset.fblrpSelectedAttributeLabel = attributeLabel(attribute);
    if (app) {
      app.fblrpSelectedAttribute = attrKey;
      app.fblrpSelectedAttributeLabel = attributeLabel(attribute);
    }
    applySelectedAttribute();
    if (!skipTotals) updateTotals();
    return true;
  }


  async function doRoll(event) {
    event?.preventDefault?.();
    if (state.isSubmitting) return;
    const payload = updateTotals({ revealChance: state.chanceRevealed });
    applySelectedAttribute();
    if (!validateDicePoolBeforeRoll(payload)) return;

    const selectedAttribute = ATTRIBUTES.find((attribute) => attribute.key === state.selectedAttr);
    const originalAttribute = ATTRIBUTES.find((attribute) => attribute.key === state.originalAttr);
    const analysis = state.canUseChance && state.chanceRevealed ? getProbabilityAnalysis(payload) : null;
    const context = buildRollContext({
      app,
      form,
      actor,
      actorResolution,
      rollType: state.specialRollProfile?.key ?? "skill",
      skillKey: state.skillKey,
      skillLabel: state.skillLabel,
      originalAttribute,
      selectedAttribute,
      payload,
      analysis,
      nativeModifiers: state.nativeSystemModifiers,
      customModifiers: state.customModifiers,
      modifierTotal: finalModifierTotal()
    });
    submitNativeRoll({
      app,
      form,
      actor,
      payload,
      context,
      state,
      bridge,
      shell,
      setSubmittingUi,
      failureLog: "Roll submission failed"
    });
  }

  installCommonEvents({
    shell,
    ui,
    state,
    bridge,
    onStep(target, delta) {
      const input = ui.input(target);
      if (!input) return;
      input.value = Math.max(0, parseNumber(input.value, 0) + delta);
      updateTotals();
    },
    onQuick: shared.toggleQuickModifier,
    onCounter: shared.stepQuickCounter,
    onAddCustom: shared.addCustomModifier,
    onCalculateChance() {
      if (!state.canUseChance) return;
      state.chanceRevealed = !state.chanceRevealed;
      if (state.chanceRevealed) updateTotals({ revealChance: true });
      else {
        hideChancePanel(ui);
      }
    },
    onRoll: doRoll,
    onCancel: () => bridge.cancel(),
    onSelectAttribute: selectAttribute,
    onNativeModifier(id, checked) {
      const modifier = state.nativeSystemModifiers.find((entry) => entry.id === id);
      if (!modifier) return;
      if (modifier.choiceGroup && checked) {
        for (const entry of state.nativeSystemModifiers) {
          if (entry.choiceGroup !== modifier.choiceGroup || entry.specialRollKey !== modifier.specialRollKey) continue;
          entry.checked = entry.id === modifier.id;
          bridge.syncModifierCheckbox(entry);
        }
        syncNativeModifierUi(shell, state.nativeSystemModifiers);
      } else {
        modifier.checked = checked;
        bridge.syncModifierCheckbox(modifier);
      }
      updateTotals();
    },
    onCustomModifier(id, field, value) {
      const modifier = state.customModifiers.get(id);
      if (!modifier) return;
      if (field === "label" && modifier.origin === "custom") {
        modifier.label = String(value ?? "").trim() || localize("Modifiers.CustomDefault", "Custom modifier");
        return;
      }
      if (field === "active") modifier.active = !!value;
      else if (field === "value") modifier.value = parseNumber(value, 0);
      updateTotals();
    },
    onRemoveCustom: shared.removeCustomModifier,
    onArtifactInput() {
      state.manualArtifactCounts = readArtifacts(shell);
      renderArtifactDice();
      updateTotals();
    },
    onDiceInput() {
      updateTotals();
    }
  });

  shell._fblrpCancelProbability = () => cancelScheduledProbability(state);
  if (state.selectedAttr) selectAttribute(state.selectedAttr, { skipModifierRefresh: true, skipTotals: true });
  updateTotals();
}

function setupArmorShell({
  app,
  form,
  bridge,
  inputs,
  armorValue,
  nativeSystemModifiers,
  domModifiers,
  actor,
  actorResolution,
  quickGroups,
  canUseChance,
  showPushPreview
}) {
  const shell = form.querySelector(".fblrp-shell[data-roll-type='armor']");
  if (!shell) throw new Error("Armor shell was committed without its root element");
  const ui = createUi(shell);
  const initial = {
    armor: Math.max(0, parseNumber(armorValue, 0)),
    artifactCounts: parseArtifactDice(inputs.artifact?.value),
    nativeSystemModifiers: cloneModifierList(nativeSystemModifiers)
  };
  const state = {
    shell,
    modifierResidual: calculateModifierResidual(inputs.modifier?.value, nativeSystemModifiers),
    customModifiers: new Map(),
    quickCounters: new Map(),
    nativeSystemModifiers,
    domModifiers,
    manualArtifactCounts: { ...initial.artifactCounts },
    canUseChance: !!canUseChance,
    showPushPreview: !!showPushPreview,
    chanceRevealed: false,
    quickGroups,

    isSubmitting: false,
    submissionCleanup: null,
    probabilityFrame: null,
    probabilityCancel: null,
    initial
  };

  function nativeAdjustmentTotal() {
    return state.modifierResidual + activeNumericModifierSum(state.nativeSystemModifiers);
  }

  function gearBonusTotal() {
    return activeGearBonusTotal(state.nativeSystemModifiers);
  }

  function customAdjustmentTotal() {
    return activeCustomModifierSum(state.customModifiers, { excludeKinds: ["armor-half"] });
  }

  function armorFactor() {
    return [...state.customModifiers.values()].some((modifier) => modifier.active && modifier.kind === "armor-half") ? 0.5 : 1;
  }

  function armorAdjustmentTotal() {
    return nativeAdjustmentTotal() + customAdjustmentTotal();
  }

  function armorDiceTotal() {
    return calculateArmorDiceTotal({
      armor: readNonNegative(ui.input("armor")),
      residual: state.modifierResidual,
      systemModifiers: state.nativeSystemModifiers,
      customModifiers: state.customModifiers,
      factor: armorFactor(),
      rounding: getSetting(SETTINGS.ARMOR_ROUNDING, "floor")
    });
  }

  function systemArtifactCounts() {
    return activeArtifactModifierCounts(state.nativeSystemModifiers);
  }

  function combinedArtifactCounts() {
    return addArtifactCounts(state.manualArtifactCounts, systemArtifactCounts());
  }

  function currentChancePayload() {
    return { base: 0, skill: 0, gear: armorDiceTotal(), modifier: 0, artifactCounts: combinedArtifactCounts() };
  }

  function renderArtifactDice() {
    renderArtifacts(shell, state.manualArtifactCounts);
  }

  function updateTotals({ revealChance = false } = {}) {
    sanitizeDiceInput(ui.input("armor"));
    const adjustment = armorAdjustmentTotal();
    const gearBonus = gearBonusTotal();
    const factor = armorFactor();
    const totalText = `${signed(adjustment + gearBonus)}${factor < 1 ? " / ×0.5" : ""}`;
    ui.setText('[data-field="modifier-total"]', totalText);

    const totalArmorDice = armorDiceTotal();
    const representableGearBonus = Math.min(totalArmorDice, gearBonus);
    const nativeArmorDice = totalArmorDice - representableGearBonus;
    const preserveGearBonusFlavors = representableGearBonus === gearBonus;

    bridge.setValue("base", 0);
    bridge.setValue("skill", 0);
    bridge.setNativeGearValue(preserveGearBonusFlavors ? nativeArmorDice : totalArmorDice);
    bridge.setValue("gear", totalArmorDice);
    bridge.setValue("artifact", buildArtifactValue(combinedArtifactCounts()));
    bridge.setValue("modifier", 0);
    bridge.syncSyntheticGearBonuses(preserveGearBonusFlavors ? state.nativeSystemModifiers : []);

    const payload = currentChancePayload();
    updateZeroDiceWarning(ui, payload);
    if (state.canUseChance && (state.chanceRevealed || revealChance)) {
      if (revealChance) updateChanceAnalysis(ui, payload, state.showPushPreview, true);
      else scheduleChanceAnalysis(state, ui, payload, state.showPushPreview);
    }
    return payload;
  }

  const shared = createSharedRollController({
    state,
    shell,
    ui,
    armorMode: true,
    updateTotals,
    customLabelKey: "Armor.CustomDefault",
    customLabelFallback: "Armor adjustment"
  });


  async function doRoll(event) {
    event?.preventDefault?.();
    if (state.isSubmitting) return;
    const payload = updateTotals({ revealChance: state.chanceRevealed });
    if (!validateDicePoolBeforeRoll(payload)) return;

    const analysis = state.canUseChance && state.chanceRevealed ? getProbabilityAnalysis(payload) : null;
    const context = buildRollContext({
      app,
      form,
      actor,
      actorResolution,
      rollType: "armor",
      skillKey: "armor",
      skillLabel: localize("Armor.Title", "Armor roll"),
      payload,
      analysis,
      nativeModifiers: state.nativeSystemModifiers,
      customModifiers: state.customModifiers,
      modifierTotal: armorAdjustmentTotal() + gearBonusTotal()
    });
    submitNativeRoll({
      app,
      form,
      actor,
      payload,
      context,
      state,
      bridge,
      shell,
      setSubmittingUi,
      failureLog: "Armor roll submission failed"
    });
  }

  installCommonEvents({
    shell,
    ui,
    state,
    bridge,
    onStep(target, delta) {
      const input = ui.input(target);
      if (!input) return;
      input.value = Math.max(0, parseNumber(input.value, 0) + delta);
      updateTotals();
    },
    onQuick: shared.toggleQuickModifier,
    onCounter: shared.stepQuickCounter,
    onAddCustom: shared.addCustomModifier,
    onCalculateChance() {
      if (!state.canUseChance) return;
      state.chanceRevealed = !state.chanceRevealed;
      if (state.chanceRevealed) updateTotals({ revealChance: true });
      else {
        hideChancePanel(ui);
      }
    },
    onRoll: doRoll,
    onCancel: () => bridge.cancel(),
    onSelectAttribute: () => {},
    onNativeModifier(id, checked) {
      const modifier = state.nativeSystemModifiers.find((entry) => entry.id === id);
      if (!modifier) return;
      modifier.checked = checked;
      bridge.syncModifierCheckbox(modifier);
      updateTotals();
    },
    onCustomModifier(id, field, value) {
      const modifier = state.customModifiers.get(id);
      if (!modifier) return;
      if (field === "label" && modifier.origin === "custom") {
        modifier.label = String(value ?? "").trim() || localize("Armor.CustomDefault", "Armor adjustment");
        return;
      }
      if (field === "active") modifier.active = !!value;
      else if (field === "value") modifier.value = parseNumber(value, 0);
      updateTotals();
    },
    onRemoveCustom: shared.removeCustomModifier,
    onArtifactInput() {
      state.manualArtifactCounts = readArtifacts(shell);
      renderArtifactDice();
      updateTotals();
    },
    onDiceInput() {
      updateTotals();
    }
  });

  shell._fblrpCancelProbability = () => cancelScheduledProbability(state);
  updateTotals();
}

function createSharedRollController({ state, shell, ui, armorMode, updateTotals, customLabelKey, customLabelFallback }) {
  function renderCustomModifiers() {
    renderCustomModifierList(ui.el('[data-list="custom-modifiers"]'), state.customModifiers);
  }

  function addCustomModifier() {
    const id = uniqueId(armorMode ? "armor-custom" : "custom");
    state.customModifiers.set(id, {
      id,
      label: localize(customLabelKey, customLabelFallback),
      value: 0,
      active: true,
      origin: "custom",
      kind: "numeric",
      groupKey: null
    });
    renderCustomModifiers();
    updateTotals();
    focusCustomValue(shell, id);
  }

  function toggleQuickModifier(button) {
    const descriptor = quickDescriptorFromButton(button);
    if (!descriptor.id) return;
    if (state.customModifiers.has(descriptor.id)) {
      state.customModifiers.delete(descriptor.id);
      button.classList.remove("is-active");
    } else {
      if (descriptor.mode === "exclusive") clearQuickGroup(state, shell, descriptor.groupKey);
      state.customModifiers.set(descriptor.id, { ...descriptor, active: true, origin: "quick" });
      button.classList.add("is-active");
    }
    renderCustomModifiers();
    updateTotals();
  }

  function stepQuickCounter(groupKey, delta) {
    const group = state.quickGroups.find((entry) => entry.key === groupKey && entry.mode === "counter");
    if (!group) return;
    const current = parseNumber(state.quickCounters.get(groupKey), 0);
    const next = Math.max(parseNumber(group.min, -5), Math.min(parseNumber(group.max, 5), current + delta));
    state.quickCounters.set(groupKey, next);
    const id = `quick-counter-${groupKey}`;
    if (!next) state.customModifiers.delete(id);
    else {
      const positive = next > 0;
      const label = positive
        ? format("Quick.HelpCount", { count: Math.abs(next) }, `Help ×${Math.abs(next)}`)
        : format("Quick.HindranceCount", { count: Math.abs(next) }, `Hindrance ×${Math.abs(next)}`);
      state.customModifiers.set(id, { id, label, value: next, active: true, origin: "quick", groupKey, kind: "counter" });
    }
    updateCounterUi(shell, groupKey, next);
    renderCustomModifiers();
    updateTotals();
  }

  function removeCustomModifier(id) {
    const modifier = state.customModifiers.get(id);
    if (!modifier) return;
    state.customModifiers.delete(id);
    shell.querySelector(`[data-action="quick-mod"][data-id="${cssEscape(id)}"]`)?.classList.remove("is-active");
    renderCustomModifiers();
    updateTotals();
  }

  return {
    renderCustomModifiers,
    addCustomModifier,
    toggleQuickModifier,
    stepQuickCounter,
    removeCustomModifier
  };
}

function installCommonEvents(callbacks) {
  const { shell, ui, state } = callbacks;

  shell.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button || !shell.contains(button)) return;
    const action = button.dataset.action;
    if (!action) return;

    if (action === "step") {
      event.preventDefault();
      callbacks.onStep(button.dataset.target, parseNumber(button.dataset.delta, 0));
    } else if (action === "select-attribute") {
      event.preventDefault();
      callbacks.onSelectAttribute(button.dataset.attr);
    } else if (action === "quick-mod") {
      event.preventDefault();
      callbacks.onQuick(button);
      setQuickPanelOpen(ui, false);
    } else if (action === "quick-counter") {
      event.preventDefault();
      callbacks.onCounter(button.dataset.group, parseNumber(button.dataset.delta, 0));
    } else if (action === "toggle-quick-panel") {
      event.preventDefault();
      setQuickPanelOpen(ui, !ui.el(".fblrp-quick-panel")?.classList.contains("is-open"), button);
    } else if (action === "close-quick-panel") {
      event.preventDefault();
      setQuickPanelOpen(ui, false);
    } else if (action === "toggle-quick-group") {
      event.preventDefault();
      const grid = button.closest(".fblrp-quick-group")?.querySelector(".fblrp-quick-grid");
      const collapsed = grid?.classList.toggle("is-collapsed");
      button.setAttribute("aria-expanded", collapsed ? "false" : "true");
    } else if (action === "add-custom-modifier") {
      event.preventDefault();
      callbacks.onAddCustom();
    } else if (action === "remove-custom-mod") {
      event.preventDefault();
      callbacks.onRemoveCustom(button.dataset.id);
    } else if (action === "calculate-chance") {
      event.preventDefault();
      callbacks.onCalculateChance();
    } else if (action === "roll") {
      callbacks.onRoll(event);
    } else if (action === "cancel") {
      event.preventDefault();
      callbacks.onCancel();
    }
  });

  shell.addEventListener("change", (event) => {
    const native = event.target.closest('input[data-action="native-mod"]');
    if (native) callbacks.onNativeModifier(native.dataset.id, native.checked);
    const customToggle = event.target.closest('input[data-action="custom-mod"]');
    if (customToggle) callbacks.onCustomModifier(customToggle.dataset.id, "active", customToggle.checked);
  });

  shell.addEventListener("input", (event) => {
    if (event.target.closest("input[data-artifact-die-input]")) {
      callbacks.onArtifactInput();
      return;
    }
    if (event.target.closest("input[data-input]")) {
      callbacks.onDiceInput();
      return;
    }
    const field = event.target.closest("input[data-custom-field]");
    if (field) callbacks.onCustomModifier(field.dataset.id, field.dataset.customField, field.value);
  });

  shell.addEventListener("keydown", (event) => {
    const quickPanel = ui.el(".fblrp-quick-panel");
    const quickOpen = quickPanel?.classList.contains("is-open");
    if (event.key === "Tab" && quickOpen) {
      trapFocus(event, quickPanel);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (quickOpen) setQuickPanelOpen(ui, false);
      else if (!state.isSubmitting) callbacks.onCancel();
      return;
    }

    if (event.key === "Enter" && event.ctrlKey) {
      callbacks.onRoll(event);
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      const input = event.target.closest("input");
      if (!input) return;
      if (input.matches("[data-custom-field], [data-artifact-die-input]")) {
        event.preventDefault();
        input.blur();
        return;
      }
      callbacks.onRoll(event);
    }
  });
  updateCounterUi(shell, "help", parseNumber(state.quickCounters?.get?.("help"), 0));
}

function createUi(shell) {
  const elementCache = new Map();
  const inputCache = new Map(
    [...shell.querySelectorAll("[data-input]")].map((input) => [input.dataset.input, input])
  );
  const el = (selector) => {
    const cached = elementCache.get(selector);
    if (cached?.isConnected) return cached;
    const element = shell.querySelector(selector);
    if (element) elementCache.set(selector, element);
    return element;
  };
  return {
    shell,
    el,
    all: (selector) => [...shell.querySelectorAll(selector)],
    input: (name) => inputCache.get(name) ?? null,
    setInput(name, value) {
      const input = inputCache.get(name);
      if (input) input.value = value;
    },
    setText(selector, value) {
      const element = el(selector);
      if (element) element.textContent = value;
    }
  };
}

function updateChanceAnalysis(ui, payload, showPushPreview, reveal) {
  const panel = ui.el("[data-chance-panel]");
  if (panel && reveal) panel.classList.remove("is-hidden");
  const poolDescription = describeChancePool(payload);
  ui.setText('[data-chance="pool"]', poolDescription);

  if (totalDiceCount(payload) > PROBABILITY_PREVIEW_LIMIT) {
    const unavailable = localize("Chance.PreviewUnavailable", "Preview unavailable for this pool size");
    ui.setText('[data-chance="now"]', "—");
    ui.setText('[data-chance="expected"]', "—");
    ui.setText('[data-chance="push"]', "—");
    ui.setText('[data-chance="attribute-risk"]', "—");
    ui.setText('[data-chance="gear-risk"]', "—");
    const distribution = ui.el('[data-chance="distribution"]');
    if (distribution) distribution.innerHTML = `<span class="fblrp-probability-limit"><small>${escapeHtml(unavailable)}</small></span>`;
    const button = ui.el('[data-action="calculate-chance"]');
    if (button) button.title = `${unavailable} (${poolDescription})`;
    return null;
  }

  const analysis = getProbabilityAnalysis(payload);
  if (!analysis) return null;

  ui.setText('[data-chance="now"]', formatChance(analysis.chance));
  ui.setText('[data-chance="expected"]', formatExpected(analysis.expectedSuccesses));
  if (showPushPreview) {
    ui.setText('[data-chance="push"]', formatChance(analysis.pushedChance));
    ui.setText('[data-chance="attribute-risk"]', formatChance(analysis.attributeDamageRisk));
    ui.setText('[data-chance="gear-risk"]', formatChance(analysis.gearDamageRisk));
  }

  const distribution = ui.el('[data-chance="distribution"]');
  if (distribution) {
    const buckets = analysis.buckets;
    distribution.innerHTML = [
      ["0", buckets.zero],
      ["1", buckets.one],
      ["2", buckets.two],
      ["3+", buckets.threePlus]
    ].map(([label, value]) => `<span><small>${label}</small><strong>${formatChance(value)}</strong></span>`).join("");
  }
  const button = ui.el('[data-action="calculate-chance"]');
  if (button) button.title = `${localize("Chance.Button", "Chance")}: ${formatChance(analysis.chance)} (${poolDescription})`;
  return analysis;
}

function scheduleChanceAnalysis(state, ui, payload, showPushPreview) {
  state.pendingProbabilityPayload = {
    base: payload.base,
    skill: payload.skill,
    gear: payload.gear,
    modifier: payload.modifier,
    artifactCounts: { ...(payload.artifactCounts ?? {}) }
  };
  if (state.probabilityFrame != null) return;
  const usesAnimationFrame = typeof globalThis.requestAnimationFrame === "function";
  const schedule = usesAnimationFrame ? globalThis.requestAnimationFrame : ((callback) => globalThis.setTimeout(callback, 0));
  state.probabilityCancel = usesAnimationFrame ? globalThis.cancelAnimationFrame : globalThis.clearTimeout;
  state.probabilityFrame = schedule(() => {
    state.probabilityFrame = null;
    state.probabilityCancel = null;
    if (!state.shell?.isConnected) return;
    updateChanceAnalysis(ui, state.pendingProbabilityPayload, showPushPreview, true);
  });
}

function cancelScheduledProbability(state) {
  if (state?.probabilityFrame == null) return;
  state.probabilityCancel?.(state.probabilityFrame);
  state.probabilityFrame = null;
  state.probabilityCancel = null;
}

function getProbabilityAnalysis(payload) {
  if (totalDiceCount(payload) > PROBABILITY_PREVIEW_LIMIT) return null;
  const cacheKey = probabilityCacheKey(payload);
  let analysis = probabilityAnalysisCache.get(cacheKey);
  if (analysis) return analysis;
  analysis = calculateChanceAnalysis(payload);
  probabilityAnalysisCache.set(cacheKey, analysis);
  if (probabilityAnalysisCache.size > PROBABILITY_CACHE_LIMIT) {
    probabilityAnalysisCache.delete(probabilityAnalysisCache.keys().next().value);
  }
  return analysis;
}

function probabilityCacheKey(payload) {
  return [
    parseNumber(payload?.base, 0),
    parseNumber(payload?.skill, 0),
    parseNumber(payload?.gear, 0),
    parseNumber(payload?.modifier, 0),
    ...ARTIFACT_DICE.map((die) => parseNumber(payload?.artifactCounts?.[die], 0))
  ].join("|");
}

function hideChancePanel(ui) {
  ui.el("[data-chance-panel]")?.classList.add("is-hidden");
}

function updateZeroDiceWarning(ui, payload) {
  const warning = ui.el('[data-field="zero-warning"]');
  if (!warning) return;
  const total = totalDiceCount(payload);
  const positive = totalPositiveDiceCount(payload);
  warning.classList.toggle("is-hidden", total > 0 && positive > 0);
  if (total === 0) {
    warning.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${escapeHtml(localize("Dialog.ZeroDiceWarning", "No dice: Forbidden Lands will reject this roll."))}`;
  } else if (positive === 0) {
    warning.innerHTML = `<i class="fa-solid fa-circle-minus"></i> ${escapeHtml(localize("Dialog.NegativeOnlyWarning", "Only negative dice remain. Success is impossible."))}`;
  }
}

function validateDicePoolBeforeRoll(payload) {
  if (totalDiceCount(payload) > 0) return true;
  const message = localize("Dialog.ZeroDiceBlocked", "The pool contains no dice. Forbidden Lands cannot submit this roll.");
  globalThis.ui?.notifications?.warn?.(message);
  return false;
}

function buildRollContext({
  app,
  form,
  actor,
  actorResolution,
  rollType,
  skillKey,
  skillLabel,
  originalAttribute,
  selectedAttribute,
  payload,
  analysis,
  nativeModifiers,
  customModifiers,
  modifierTotal
}) {
  const activeSystem = nativeModifiers.filter((mod) => mod.checked).map(toContextModifier);
  const activeQuick = [...customModifiers.values()].filter((mod) => mod.active && mod.origin === "quick").map(toContextModifier);
  const activeCustom = [...customModifiers.values()].filter((mod) => mod.active && mod.origin !== "quick").map(toContextModifier);
  const metadata = getDialogSubmissionMetadata({ app, form, actor, rollType, skillKey, selectedAttribute, skillLabel });
  return {
    userId: globalThis.game?.user?.id ?? null,
    actorId: metadata.actorId,
    actorUuid: actor?.uuid ?? null,
    actorName: actor?.name ?? "",
    actorResolved: !!actor,
    actorResolutionSource: actorResolution?.source ?? "unresolved",
    tokenId: metadata.tokenId,
    sceneId: metadata.sceneId,
    itemId: metadata.itemId,
    title: metadata.title,
    action: metadata.action,
    rollType,
    skillKey: skillKey ?? "",
    skillLabel: skillLabel ?? "",
    originalAttribute: originalAttribute?.key ?? "",
    originalAttributeLabel: originalAttribute ? attributeLabel(originalAttribute) : "",
    selectedAttribute: selectedAttribute?.key ?? "",
    selectedAttributeLabel: selectedAttribute ? attributeLabel(selectedAttribute) : "",
    selectedAttributeShort: selectedAttribute ? attributeShort(selectedAttribute) : "",
    poolText: describeChancePool(payload),
    chance: analysis ? formatChance(analysis.chance) : null,
    pushedChance: analysis ? formatChance(analysis.pushedChance) : null,
    modifierTotal,
    systemModifiers: activeSystem,
    quickModifiers: activeQuick,
    customModifiers: activeCustom
  };
}

function getDialogSubmissionMetadata({ app, form, actor, rollType, skillKey, selectedAttribute, skillLabel }) {
  const actorId = actor?.id ?? actor?._id ?? app?.options?.actorId ?? form?.dataset?.actorId ?? null;
  const tokenId = app?.options?.tokenId ?? app?.speaker?.token ?? form?.dataset?.tokenId ?? actor?.token?.id ?? null;
  const sceneId = app?.options?.sceneId ?? app?.speaker?.scene ?? form?.dataset?.sceneId ?? actor?.token?.parent?.id ?? null;
  const itemId = app?.gear?.itemId
    ?? app?.gear?.id
    ?? app?.options?.itemId
    ?? app?.item?.id
    ?? form?.dataset?.itemId
    ?? null;
  const action = app?.options?.action ?? app?.options?.mishapType ?? form?.dataset?.action ?? null;
  const title = app?.title ?? app?.options?.title ?? skillLabel ?? rollType;
  return {
    actorId,
    tokenId,
    sceneId,
    itemId,
    action,
    title,
    rollType,
    skillKey,
    attribute: selectedAttribute?.key ?? app?.base?.name ?? null
  };
}

function toContextModifier(mod) {
  return {
    name: mod.name ?? mod.label ?? "",
    value: parseNumber(mod.value, 0),
    display: mod.display ?? signed(mod.value),
    origin: mod.origin ?? ""
  };
}

function quickDescriptorFromButton(button) {
  return {
    id: button.dataset.id,
    label: button.dataset.label ?? button.dataset.id,
    value: parseNumber(button.dataset.value, 0),
    display: button.dataset.display ?? signed(button.dataset.value),
    kind: button.dataset.kind ?? "numeric",
    factor: Number(button.dataset.factor || 1),
    groupKey: button.dataset.group ?? null,
    mode: button.dataset.mode ?? "toggle"
  };
}

function clearQuickGroup(state, shell, groupKey) {
  for (const [id, mod] of state.customModifiers) {
    if (mod.origin === "quick" && mod.groupKey === groupKey) state.customModifiers.delete(id);
  }
  shell.querySelectorAll(`[data-action="quick-mod"][data-group="${cssEscape(groupKey)}"]`).forEach((button) => button.classList.remove("is-active"));
}

function setQuickPanelOpen(ui, open, trigger = null) {
  const panel = ui.el(".fblrp-quick-panel");
  const backdrop = ui.el(".fblrp-quick-backdrop");
  const triggers = ui.all('[data-action="toggle-quick-panel"]');
  if (!panel) return;
  if (open) panel._fblrpReturnFocus = trigger ?? document.activeElement;
  panel.classList.toggle("is-open", open);
  backdrop?.classList.toggle("is-open", open);
  panel.setAttribute("aria-hidden", open ? "false" : "true");
  triggers.forEach((button) => button.setAttribute("aria-expanded", open ? "true" : "false"));
  if (open) {
    const focusable = getFocusableElements(panel);
    (focusable[0] ?? panel).focus?.();
  } else {
    const returnFocus = panel._fblrpReturnFocus;
    panel._fblrpReturnFocus = null;
    if (returnFocus?.isConnected) returnFocus.focus?.();
  }
}

function trapFocus(event, container) {
  const focusable = getFocusableElements(container);
  if (!focusable.length) {
    event.preventDefault();
    container.focus?.();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function getFocusableElements(container) {
  return [...container.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    .filter((element) => !element.hidden && element.offsetParent !== null);
}


function syncNativeModifierUi(shell, modifiers = []) {
  const byId = new Map(modifiers.map((modifier) => [modifier.id, modifier]));
  for (const input of shell.querySelectorAll('input[data-action="native-mod"][data-id]')) {
    const modifier = byId.get(input.dataset.id);
    if (modifier && input.checked !== !!modifier.checked) input.checked = !!modifier.checked;
  }
}

function renderArtifacts(shell, counts) {
  for (const die of ARTIFACT_DICE) {
    const count = Math.max(0, parseNumber(counts?.[die], 0));
    const row = shell.querySelector(`[data-artifact-die="${die}"]`);
    const input = shell.querySelector(`[data-artifact-die-input="${die}"]`);
    row?.classList.toggle("is-active", count > 0);
    if (input && document.activeElement !== input) input.value = count ? String(count) : "";
  }
  const container = shell.querySelector(".fblrp-artifacts");
  if (container) container.dataset.artifactCounts = JSON.stringify(counts);
}

function readArtifacts(shell) {
  const counts = emptyArtifacts();
  for (const die of ARTIFACT_DICE) counts[die] = Math.max(0, parseNumber(shell.querySelector(`[data-artifact-die-input="${die}"]`)?.value, 0));
  return counts;
}

function updateCounterUi(shell, groupKey, value) {
  const element = shell.querySelector(`[data-quick-counter-value="${cssEscape(groupKey)}"]`);
  if (element) element.textContent = signed(value);
}

function focusCustomValue(shell, id) {
  window.setTimeout(() => {
    const input = shell.querySelector(`[data-custom-modifier="${cssEscape(id)}"] input[data-custom-field="value"]`);
    input?.focus?.();
    input?.select?.();
  }, 0);
}

function setSubmittingUi(shell, submitting) {
  shell.classList.toggle("is-submitting", !!submitting);
  shell.setAttribute("aria-busy", submitting ? "true" : "false");
  for (const control of shell.querySelectorAll('[data-action="roll"], [data-action="cancel"]')) {
    control.disabled = !!submitting;
  }
}

function findRollForm(root) {
  return root.matches?.("form.roll-dialog.attack-dialog") ? root : root.querySelector?.("form.roll-dialog.attack-dialog");
}

function cloneQuickGroups(groups = []) {
  return groups.map((group) => ({
    ...group,
    items: Array.isArray(group.items) ? group.items.map((item) => ({ ...item })) : group.items
  }));
}

function cloneModifierList(modifiers = []) {
  return modifiers.map((modifier) => ({
    ...modifier,
    artifactCounts: { d8: 0, d10: 0, d12: 0, ...(modifier.artifactCounts ?? {}) },
    linkedInputs: Array.isArray(modifier.linkedInputs) ? [...modifier.linkedInputs] : modifier.linkedInputs
  }));
}

function sanitizeDiceInput(input) {
  if (!input) return 0;
  const value = Math.max(0, parseNumber(input.value, 0));
  if (String(input.value) !== String(value)) input.value = value;
  return value;
}

function readNonNegative(input) {
  return Math.max(0, parseNumber(input?.value, 0));
}

function emptyArtifacts() {
  return { d8: 0, d10: 0, d12: 0 };
}

function uniqueId(prefix) {
  if (globalThis.foundry?.utils?.randomID) return `${prefix}-${foundry.utils.randomID()}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function cssEscape(value) {
  return globalThis.CSS?.escape ? CSS.escape(String(value)) : String(value).replace(/["\\]/g, "\\$&");
}
