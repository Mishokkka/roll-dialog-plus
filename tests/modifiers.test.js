import test from "node:test";
import assert from "node:assert/strict";
import {
  activeArtifactModifierCounts,
  addArtifactCounts,
  buildArtifactValue,
  calculateModifierResidual,
  cleanModifierName,
  mergeSystemModifiers,
  modifierIdentity,
  parseArtifactDice,
  readNativeSystemModifiers
} from "../scripts/modifiers.js";

test("artifact dice parser accepts counts and mixed separators", () => {
  assert.deepEqual(parseArtifactDice("2d8 + d10, 3D12"), { d8: 2, d10: 1, d12: 3 });
  assert.equal(buildArtifactValue({ d8: 2, d10: 1, d12: 0 }), "2d8+d10");
  assert.deepEqual(addArtifactCounts({ d8: 1, d10: 2 }, { d8: 2, d12: 1 }), { d8: 3, d10: 2, d12: 1 });
});

test("DOM and actor modifiers merge without losing the native input", () => {
  const nativeInput = { checked: true };
  const dom = [{
    id: "native-1",
    name: "Talent",
    value: 1,
    gearBonus: false,
    artifactCounts: { d8: 0, d10: 0, d12: 0 },
    checked: true,
    input: nativeInput,
    origin: "dom"
  }];
  const actor = [{
    id: "actor-1",
    name: "Talent",
    value: 1,
    gearBonus: false,
    artifactCounts: { d8: 0, d10: 0, d12: 0 },
    checked: false,
    input: null,
    origin: "actor",
    explanation: "Actor API detail"
  }];
  const merged = mergeSystemModifiers(dom, actor);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].input, nativeInput);
  assert.equal(merged[0].origin, "dom+actor");
  assert.equal(merged[0].explanation, "Actor API detail");
});

test("previous selection survives modifier refresh", () => {
  const base = {
    name: "Weather",
    value: -1,
    gearBonus: false,
    artifactCounts: { d8: 0, d10: 0, d12: 0 },
    checked: true,
    origin: "dom"
  };
  const first = mergeSystemModifiers([{ ...base, id: "old", input: {} }], []);
  first[0].checked = false;
  const refreshed = mergeSystemModifiers([{ ...base, id: "new", input: {} }], [], first);
  assert.equal(refreshed[0].checked, false);
});


test("residual modifier preserves native value outside recognized options", () => {
  const modifiers = [
    {
      id: "native-option",
      name: "Option",
      value: 2,
      gearBonus: false,
      artifactCounts: { d8: 0, d10: 0, d12: 0 },
      checked: true,
      input: {},
      origin: "dom"
    },
    {
      id: "actor-suggestion",
      name: "Suggestion",
      value: 1,
      gearBonus: false,
      artifactCounts: { d8: 0, d10: 0, d12: 0 },
      checked: true,
      input: null,
      origin: "actor"
    }
  ];
  assert.equal(calculateModifierResidual(5, modifiers), 3);
});

test("same-looking actor modifiers with distinct sources remain distinct", () => {
  const actor = [
    { id: "a", name: "Talent", value: 1, sourceUuid: "Item.A", checked: true, origin: "actor", artifactCounts: {} },
    { id: "b", name: "Talent", value: 1, sourceUuid: "Item.B", checked: true, origin: "actor", artifactCounts: {} }
  ];
  const merged = mergeSystemModifiers([], actor);
  assert.equal(merged.length, 2);
  assert.notEqual(modifierIdentity(merged[0]), modifierIdentity(merged[1]));
});

test("previous checks survive reorder by stable source identity", () => {
  const previous = [
    { id: "old-a", sourceUuid: "Item.A", name: "A", value: 1, checked: false, artifactCounts: {} },
    { id: "old-b", sourceUuid: "Item.B", name: "B", value: 1, checked: true, artifactCounts: {} }
  ];
  const refreshed = [
    { id: "new-b", sourceUuid: "Item.B", name: "B", value: 1, checked: false, artifactCounts: {} },
    { id: "new-a", sourceUuid: "Item.A", name: "A", value: 1, checked: true, artifactCounts: {} }
  ];
  const merged = mergeSystemModifiers([], refreshed, previous);
  assert.equal(merged[0].checked, true);
  assert.equal(merged[1].checked, false);
});

test("official data-id is used as the native modifier source identity", () => {
  const row = {
    textContent: "Painter D8",
    dataset: {},
    title: "",
    parentElement: null
  };
  const input = {
    checked: false,
    disabled: false,
    name: "rollModifier",
    value: "1d8",
    title: "",
    dataset: { id: "talent-painter" },
    closest() { return row; }
  };
  const form = {
    querySelectorAll(selector) {
      return selector === ".options input[type='checkbox']" ? [input] : [];
    }
  };
  const [modifier] = readNativeSystemModifiers(form);
  assert.equal(modifier.sourceId, "talent-painter");
  assert.equal(modifier.name, "Painter");
  assert.deepEqual(modifier.artifactCounts, { d8: 1, d10: 0, d12: 0 });
});

test("merged linked input arrays are cloned instead of shared with hook consumers", () => {
  const linkedInputs = [{ checked: false }];
  const [merged] = mergeSystemModifiers([{
    id: "native-a",
    sourceId: "a",
    name: "A",
    value: 1,
    checked: false,
    artifactCounts: {},
    linkedInputs
  }], []);
  assert.notEqual(merged.linkedInputs, linkedInputs);
  merged.linkedInputs.push({ checked: true });
  assert.equal(linkedInputs.length, 1);
});

test("duplicate actor options from the same talent source collapse into one row", () => {
  const firstInput = { checked: false };
  const secondInput = { checked: false };
  const dom = [
    { id: "dom-a", name: "Fast Footwork", value: 1, nativeName: "fast-footwork", nativeValue: "1", checked: false, input: firstInput, origin: "dom", artifactCounts: {} },
    { id: "dom-b", name: "Fast Footwork", value: 1, nativeName: "fast-footwork", nativeValue: "1", checked: false, input: secondInput, origin: "dom", artifactCounts: {} }
  ];
  const actor = [
    { id: "actor-a", name: "Fast Footwork", value: 1, sourceUuid: "Actor.A.Item.fast-footwork", checked: false, input: null, origin: "actor", artifactCounts: {} },
    { id: "actor-b", name: "Fast Footwork", value: 1, sourceUuid: "Actor.A.Item.fast-footwork", checked: false, input: null, origin: "actor", artifactCounts: {} }
  ];
  const merged = mergeSystemModifiers(dom, actor);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].name, "Fast Footwork");
  assert.deepEqual(merged[0].linkedInputs, [firstInput, secondInput]);
});

test("duplicate checked native copies are removed from residual as one semantic modifier", () => {
  const dom = [
    { id: "dom-a", name: "Fast Footwork", value: 1, nativeName: "fast-footwork", nativeValue: "1", checked: true, input: {}, origin: "dom", artifactCounts: {} },
    { id: "dom-b", name: "Fast Footwork", value: 1, nativeName: "fast-footwork", nativeValue: "1", checked: true, input: {}, origin: "dom", artifactCounts: {} }
  ];
  const actor = [
    { id: "actor-a", name: "Fast Footwork", value: 1, sourceUuid: "Actor.A.Item.fast-footwork", checked: true, origin: "actor", artifactCounts: {} },
    { id: "actor-b", name: "Fast Footwork", value: 1, sourceUuid: "Actor.A.Item.fast-footwork", checked: true, origin: "actor", artifactCounts: {} }
  ];
  const merged = mergeSystemModifiers(dom, actor);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].nativeActiveCopies, 2);
  assert.equal(calculateModifierResidual(2, merged), 0);
});


test("artifact modifier names remove native trailing dice fragments", () => {
  assert.equal(cleanModifierName("Painter 1d", { d8: 1 }), "Painter");
  assert.equal(cleanModifierName("Painter + 1d8", { d8: 1 }), "Painter");
  assert.equal(cleanModifierName("Painter 1d", {}), "Painter 1d");
});

test("native and actor artifact representations collapse into one semantic row", () => {
  const nativeInput = { checked: false };
  const dom = [{
    id: "native-painter",
    name: "Painter 1d",
    value: 0,
    display: "D8",
    artifactCounts: { d8: 1, d10: 0, d12: 0 },
    checked: false,
    input: nativeInput,
    nativeName: "rollModifier",
    nativeValue: "1d8",
    origin: "dom"
  }];
  const actor = [{
    id: "actor-painter",
    name: "Painter",
    value: 0,
    display: "D8",
    artifactCounts: { d8: 1, d10: 0, d12: 0 },
    checked: false,
    input: null,
    sourceId: "talent-painter",
    origin: "actor"
  }];

  const merged = mergeSystemModifiers(dom, actor);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].input, nativeInput);
  assert.equal(merged[0].sourceId, "talent-painter");
  assert.equal(merged[0].origin, "dom+actor");

  merged[0].checked = true;
  assert.deepEqual(activeArtifactModifierCounts(merged), { d8: 1, d10: 0, d12: 0 });
});
