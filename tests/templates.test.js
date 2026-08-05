import test from "node:test";
import assert from "node:assert/strict";

test("Dodge shell renders the special profile and firearm house rule", async () => {
  globalThis.document = {
    createElement() {
      return {
        _text: "",
        innerHTML: "",
        set textContent(value) {
          this._text = String(value ?? "");
          this.innerHTML = this._text
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
        },
        get textContent() { return this._text; }
      };
    }
  };

  const { buildShellHTML } = await import("../scripts/templates.js");
  const { applySpecialRollProfile, getSpecialRollProfile, getSpecialRollView } = await import("../scripts/services/special-rolls.js");
  const profile = getSpecialRollProfile("dodge");
  const modifiers = applySpecialRollProfile([
    { id: "standing", name: "Standing Dodge", value: -2, checked: true, input: {}, origin: "dom" },
    { id: "slash", name: "Dodge Slash", value: 2, checked: false, input: {}, origin: "dom" }
  ], profile);
  const html = buildShellHTML({
    baseLabel: "Agility",
    skillLabel: "Move",
    baseValue: 4,
    skillValue: 3,
    gearValue: 0,
    artifactValue: "d8",
    modifierValue: -2,
    attrValues: { strength: 3, agility: 4, wits: 3, empathy: 2 },
    selectedAttr: "agility",
    nativeSystemModifiers: modifiers,
    specialRoll: getSpecialRollView(profile),
    quickPanelId: "fblrp-quick-panel-test-a"
  });

  assert.match(html, /data-special-roll="dodge"/);
  assert.match(html, /special-dodge-standing/);
  assert.match(html, /special-dodge-firearm/);
  assert.doesNotMatch(html, /class="fblrp-house-rule"/);
  assert.doesNotMatch(html, /fblrp-context-bar/);
  assert.doesNotMatch(html, /fblrp-special-banner/);
  assert.doesNotMatch(html, /Roll uses/);
  assert.doesNotMatch(html, /<small>Agility<\/small>/);
  assert.match(html, /aria-controls="fblrp-quick-panel-test-a"/);
  assert.match(html, /id="fblrp-quick-panel-test-a"/);
  assert.match(html, /fblrp-artifact-die is-active[^>]*data-artifact-die="d8"/);
});

test("Parry shell renders weapon choices and shield icon", async () => {
  globalThis.document = {
    createElement() {
      return {
        _text: "",
        innerHTML: "",
        set textContent(value) {
          this._text = String(value ?? "");
          this.innerHTML = this._text
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
        },
        get textContent() { return this._text; }
      };
    }
  };

  const { buildShellHTML } = await import("../scripts/templates.js");
  const { applySpecialRollProfile, getSpecialRollProfile, getSpecialRollView } = await import("../scripts/services/special-rolls.js");
  const profile = getSpecialRollProfile("parry");
  const modifiers = applySpecialRollProfile([
    { id: "stab", name: "Parry Stab", value: -2, checked: false, input: {}, origin: "dom" },
    { id: "punch", name: "Parry Punch", value: 2, checked: false, input: {}, origin: "dom" }
  ], profile);
  const html = buildShellHTML({
    baseLabel: "Strength",
    skillLabel: "Melee",
    baseValue: 4,
    skillValue: 3,
    gearValue: 2,
    artifactValue: "",
    modifierValue: 0,
    attrValues: { strength: 4, agility: 3, wits: 3, empathy: 2 },
    selectedAttr: "strength",
    nativeSystemModifiers: modifiers,
    specialRoll: getSpecialRollView(profile)
  });

  assert.match(html, /data-special-roll="parry"/);
  assert.match(html, /special-parry-stab/);
  assert.match(html, /special-parry-punch/);
  assert.doesNotMatch(html, /special-parry-other/);
  assert.doesNotMatch(html, /fblrp-special-banner/);
});


test("footer omits reset and last quick setup actions", async () => {
  const { buildShellHTML } = await import("../scripts/templates.js");
  const html = buildShellHTML({
    baseLabel: "Agility", skillLabel: "Move", baseValue: 3, skillValue: 2, gearValue: 0, artifactValue: "", modifierValue: 0,
    attrValues: { strength: 2, agility: 3, wits: 2, empathy: 2 }, selectedAttr: "agility", nativeSystemModifiers: [], quickGroups: []
  });
  assert.doesNotMatch(html, /data-action="reset"/);
  assert.doesNotMatch(html, /data-action="use-last"/);
  assert.match(html, /data-action="roll"/);
  assert.match(html, /data-action="cancel"/);
});
