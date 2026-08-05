import { log } from "../core/logging.js";
import { dispatchNativeInput, parseNumber } from "../utils.js";

const CLOSE_RESTORE_DELAY_MS = 2_000;

export class NativeFormBridge {
  constructor({ app, form, inputs, nativeSubmit, nativeCancel, nativeModifiers = [] } = {}) {
    this.app = app;
    this.form = form;
    this.inputs = inputs ?? {};
    this.nativeSubmit = nativeSubmit ?? null;
    this.nativeCancel = nativeCancel ?? null;
    this.nativeModifiers = nativeModifiers;
    this.syntheticInputs = new Map();
    this.syntheticSignature = "";
    this.submissionAttempted = false;
    this.committed = false;
    this.restored = false;
    this.closeRestoreTimer = null;

    this.inputSnapshot = new Map(
      Object.entries(this.inputs)
        .filter(([, input]) => input)
        .map(([name, input]) => [name, { value: input.value, disabled: !!input.disabled }])
    );
    this.optionSnapshot = new Map(
      nativeModifiers
        .filter((modifier) => modifier.input)
        .map((modifier) => [modifier.input, { checked: !!modifier.input.checked, disabled: !!modifier.input.disabled }])
    );
    this.baseSnapshot = this.snapshotNativeBase();
    this.gearSnapshot = this.snapshotNativeGear();
  }

  get submitted() {
    return this.committed;
  }

  disableNativeOptions() {
    for (const modifier of this.nativeModifiers) {
      if (!modifier.input) continue;
      if (!modifier.input.disabled) modifier.input.disabled = true;
      modifier.input.dataset.fblrpDisabledNativeOption = "true";
    }
  }

  setValue(name, value, { dispatch = true } = {}) {
    const input = this.inputs[name];
    if (!input) return false;
    const next = String(value ?? "");
    if (String(input.value) === next) return false;
    input.value = next;
    if (dispatch) dispatchNativeInput(input);
    return true;
  }

  syncModifierCheckbox(modifier) {
    const inputs = [...new Set([modifier?.input, ...(modifier?.linkedInputs ?? [])].filter(Boolean))];
    if (!inputs.length) return false;
    const next = !!modifier.checked;
    let changed = false;
    for (const input of inputs) {
      if (input.checked === next) continue;
      input.checked = next;
      changed = true;
    }
    return changed;
  }

  applySelectedAttribute(attribute, value) {
    if (!attribute || !this.app?.base || typeof this.app.base !== "object") return false;
    try {
      const nextValue = parseNumber(value, 0);
      if (this.app.base.name === attribute.key && this.app.base.label === attribute.label && parseNumber(this.app.base.value, 0) === nextValue) return false;
      this.app.base.name = attribute.key;
      this.app.base.label = attribute.label;
      this.app.base.value = nextValue;
      return true;
    } catch (error) {
      log.warn("Could not apply selected attribute to the native roll handler", { attribute, error });
      return false;
    }
  }


  setNativeGearValue(value) {
    const gear = this.app?.gear;
    if (!gear || typeof gear !== "object") return false;
    try {
      const nextValue = Math.max(0, parseNumber(value, 0));
      if (parseNumber(gear.value, 0) === nextValue) return false;
      gear.value = nextValue;
      return true;
    } catch (error) {
      log.warn("Could not synchronize native gear dice", { value, error });
      return false;
    }
  }

  syncSyntheticGearBonuses(modifiers = []) {
    const desired = modifiers
      .filter((modifier) => modifier.checked && modifier.gearBonus)
      .map((modifier) => ({
        id: modifier.id,
        name: modifier.nativeName && /^true_/i.test(modifier.nativeName) ? modifier.nativeName : gearBonusFieldName(modifier),
        value: Math.max(0, parseNumber(modifier.value, 0))
      }))
      .filter((descriptor) => descriptor.value > 0)
      .sort((a, b) => a.id.localeCompare(b.id));
    const signature = JSON.stringify(desired);
    if (signature === this.syntheticSignature) return false;

    const desiredIds = new Set(desired.map((descriptor) => descriptor.id));
    for (const [id, input] of this.syntheticInputs) {
      if (desiredIds.has(id)) continue;
      input.remove();
      this.syntheticInputs.delete(id);
    }

    for (const descriptor of desired) {
      let input = this.syntheticInputs.get(descriptor.id);
      if (!input) {
        input = document.createElement("input");
        input.type = "hidden";
        input.dataset.fblrpSyntheticGearBonus = descriptor.id;
        this.form.appendChild(input);
        this.syntheticInputs.set(descriptor.id, input);
      }
      input.name = descriptor.name;
      input.value = "true";
    }

    this.syntheticSignature = signature;
    return true;
  }

  removeSyntheticInputs() {
    for (const input of this.syntheticInputs.values()) input.remove();
    this.syntheticInputs.clear();
    this.syntheticSignature = "";
  }

  submit() {
    if (this.committed) return false;
    if (this.submissionAttempted) throw new Error("A roll submission is already in progress");
    this.submissionAttempted = true;
    this.restored = false;
    this.clearCloseRestoreTimer();
    try {
      if (this.nativeSubmit && typeof this.form?.requestSubmit === "function") {
        this.form.requestSubmit(this.nativeSubmit);
        return true;
      }
      if (this.nativeSubmit) {
        this.nativeSubmit.click();
        return true;
      }
      const SubmitEventClass = globalThis.SubmitEvent ?? Event;
      this.form?.dispatchEvent(new SubmitEventClass("submit", { bubbles: true, cancelable: true }));
      return true;
    } catch (error) {
      this.markFailed();
      throw error;
    }
  }

  markCommitted() {
    this.committed = true;
    this.submissionAttempted = false;
    this.clearCloseRestoreTimer();
  }

  markFailed() {
    if (this.committed) return;
    this.submissionAttempted = false;
    this.clearCloseRestoreTimer();
  }

  requestCloseRestore({ delay = CLOSE_RESTORE_DELAY_MS } = {}) {
    if (this.committed || this.restored) return;
    if (!this.submissionAttempted) {
      this.restore();
      return;
    }
    this.clearCloseRestoreTimer();
    this.closeRestoreTimer = globalThis.setTimeout?.(() => {
      this.closeRestoreTimer = null;
      if (!this.committed) this.restore();
    }, delay);
  }

  async cancel() {
    this.markFailed();
    this.restore();
    if (this.nativeCancel) {
      this.nativeCancel.click();
      return;
    }
    if (typeof this.app?.close === "function") {
      await this.app.close();
      return;
    }
    this.form?.closest?.(".window-app, .application")?.querySelector?.(".header-button.close, [data-action='close']")?.click?.();
  }

  restore({ force = false } = {}) {
    if ((this.committed && !force) || this.restored) return false;
    this.clearCloseRestoreTimer();
    this.removeSyntheticInputs();
    for (const [name, snapshot] of this.inputSnapshot) {
      const input = this.inputs[name];
      if (!input) continue;
      if (String(input.value) !== String(snapshot.value)) input.value = snapshot.value;
      input.disabled = snapshot.disabled;
    }
    for (const [input, snapshot] of this.optionSnapshot) {
      input.checked = snapshot.checked;
      input.disabled = snapshot.disabled;
      delete input.dataset.fblrpDisabledNativeOption;
    }
    this.restoreNativeBase();
    this.restoreNativeGear();
    this.submissionAttempted = false;
    this.restored = true;
    return true;
  }

  snapshotNativeBase() {
    const base = this.app?.base;
    if (!base || typeof base !== "object") return null;
    return { name: base.name, label: base.label, value: base.value };
  }

  restoreNativeBase() {
    if (!this.baseSnapshot || !this.app?.base || typeof this.app.base !== "object") return;
    try {
      Object.assign(this.app.base, this.baseSnapshot);
    } catch (error) {
      log.debug("Could not restore native base state", error);
    }
  }


  snapshotNativeGear() {
    const gear = this.app?.gear;
    if (!gear || typeof gear !== "object") return null;
    return { value: gear.value };
  }

  restoreNativeGear() {
    if (!this.gearSnapshot || !this.app?.gear || typeof this.app.gear !== "object") return;
    try {
      this.app.gear.value = this.gearSnapshot.value;
    } catch (error) {
      log.debug("Could not restore native gear state", error);
    }
  }

  clearCloseRestoreTimer() {
    if (this.closeRestoreTimer == null) return;
    globalThis.clearTimeout?.(this.closeRestoreTimer);
    this.closeRestoreTimer = null;
  }
}

function safeGearFlavor(value) {
  return String(value ?? "Gear").replace(/_/g, " ").replace(/\s+/g, " ").trim() || "Gear";
}

function gearBonusFieldName(modifier) {
  const value = Math.max(0, parseNumber(modifier?.value, 0));
  return `true_${safeGearFlavor(modifier?.name)}_${value}`;
}
