import test from "node:test";
import assert from "node:assert/strict";

import {
  applySpecialRollProfile,
  buildRollIdentifiers,
  getSpecialRollProfile,
  resolveSpecialRollProfile
} from "../scripts/services/special-rolls.js";

test("Dodge is resolved from the system action context, not from generic Move", () => {
  const dodge = resolveSpecialRollProfile({ app: { options: { mishapType: "dodge" } }, skillKey: "dodge" });
  const move = resolveSpecialRollProfile({ app: { options: { mishapType: "move" } }, title: "Move", skillKey: "move" });
  assert.equal(dodge?.key, "dodge");
  assert.equal(move, null);
});

test("Dodge roll identifiers retain the action name for actor modifier lookup", () => {
  const profile = getSpecialRollProfile("dodge");
  assert.deepEqual(buildRollIdentifiers(profile, "move", "agility"), ["dodge", "move", "agility"]);
});

test("Dodge profile converts native checkboxes into two exclusive choices", () => {
  const profile = getSpecialRollProfile("dodge");
  const native = [
    { id: "native-standing", name: "Standing Dodge", value: -2, checked: true, input: { name: "standing" }, origin: "dom" },
    { id: "native-slash", name: "Dodge Slash", value: 2, checked: false, input: { name: "slash" }, origin: "dom" }
  ];
  const modifiers = applySpecialRollProfile(native, profile);
  const posture = modifiers.filter((modifier) => modifier.choiceGroup === "dodge-posture");
  const attack = modifiers.filter((modifier) => modifier.choiceGroup === "dodge-attack-type");

  assert.equal(posture.length, 2);
  assert.equal(attack.length, 3);
  assert.deepEqual(posture.filter((modifier) => modifier.checked).map((modifier) => modifier.id), ["special-dodge-standing"]);
  assert.deepEqual(attack.filter((modifier) => modifier.checked).map((modifier) => modifier.id), ["special-dodge-other-attack"]);
  assert.equal(modifiers.find((modifier) => modifier.id === "special-dodge-firearm")?.value, -2);
  assert.equal(modifiers.find((modifier) => modifier.id === "special-dodge-firearm")?.houseRule, true);
});

test("selected firearm Dodge survives actor modifier refresh", () => {
  const profile = getSpecialRollProfile("dodge");
  const native = [
    { id: "native-standing", name: "Standing Dodge", value: -2, checked: true, input: { name: "standing" }, origin: "dom" },
    { id: "native-slash", name: "Dodge Slash", value: 2, checked: false, input: { name: "slash" }, origin: "dom" }
  ];
  const previous = applySpecialRollProfile(native, profile);
  for (const modifier of previous.filter((entry) => entry.choiceGroup === "dodge-attack-type")) {
    modifier.checked = modifier.id === "special-dodge-firearm";
  }
  const refreshed = applySpecialRollProfile(native, profile, previous);
  assert.deepEqual(
    refreshed.filter((modifier) => modifier.choiceGroup === "dodge-attack-type" && modifier.checked).map((modifier) => modifier.id),
    ["special-dodge-firearm"]
  );
});

test("Parry is resolved from the system action context, not from generic Melee", () => {
  const parry = resolveSpecialRollProfile({ app: { options: { action: "parry" } }, skillKey: "melee" });
  const melee = resolveSpecialRollProfile({ app: { options: { action: "melee" } }, title: "Melee", skillKey: "melee" });
  assert.equal(parry?.key, "parry");
  assert.equal(melee, null);
});

test("Parry roll identifiers retain the selected weapon or shield id", () => {
  const profile = getSpecialRollProfile("parry");
  assert.deepEqual(
    buildRollIdentifiers(profile, "melee", "strength", { app: { gear: { itemId: "weapon-id" } } }),
    ["parry", "melee", "strength", "weapon-id"]
  );
});

test("weapon Parry profile exposes the attack matrix and preserves the mandatory Parrying penalty", () => {
  const profile = getSpecialRollProfile("parry");
  const native = [
    { id: "penalty", name: "Parrying", value: -2, checked: true, input: { name: "parry-penalty" }, origin: "dom" },
    { id: "stab", name: "Parry Stab", value: -2, checked: false, input: { name: "parry-stab" }, origin: "dom" },
    { id: "punch", name: "Parry Punch", value: 2, checked: false, input: { name: "parry-punch" }, origin: "dom" }
  ];
  const modifiers = applySpecialRollProfile(native, profile);
  const attack = modifiers.filter((modifier) => modifier.choiceGroup === "parry-attack-type");

  assert.deepEqual(attack.map((modifier) => modifier.id), [
    "special-parry-slash",
    "special-parry-stab",
    "special-parry-punch"
  ]);
  assert.deepEqual(attack.filter((modifier) => modifier.checked).map((modifier) => modifier.id), ["special-parry-slash"]);
  assert.equal(modifiers.find((modifier) => modifier.id === "penalty")?.checked, true);
  assert.equal(modifiers.find((modifier) => modifier.id === "special-parry-shield-non-slash"), undefined);
});

test("shield Parry profile replaces weapon-specific choices with the system non-slash bonus", () => {
  const profile = getSpecialRollProfile("parry");
  const native = [
    { id: "non-slash", name: "Parry Non-Slash", value: 2, checked: false, input: { name: "parry-non-slash" }, origin: "dom" }
  ];
  const modifiers = applySpecialRollProfile(native, profile);
  const attack = modifiers.filter((modifier) => modifier.choiceGroup === "parry-attack-type");

  assert.deepEqual(attack.map((modifier) => modifier.id), [
    "special-parry-slash",
    "special-parry-shield-non-slash"
  ]);
  assert.equal(modifiers.find((modifier) => modifier.id === "special-parry-shield-non-slash")?.value, 2);
  assert.equal(modifiers.find((modifier) => modifier.id === "special-parry-stab"), undefined);
  assert.equal(modifiers.find((modifier) => modifier.id === "special-parry-punch"), undefined);
});
