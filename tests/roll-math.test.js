import test from "node:test";
import assert from "node:assert/strict";
import { calculateArmorDiceTotal, calculateSkillModifierTotal } from "../scripts/model/roll-math.js";

const emptyArtifacts = { d8: 0, d10: 0, d12: 0 };

test("skill modifier combines residual, system and custom values without gear bonuses", () => {
  const systemModifiers = [
    { checked: true, value: 2, gearBonus: false, artifactCounts: emptyArtifacts },
    { checked: true, value: 3, gearBonus: true, artifactCounts: emptyArtifacts }
  ];
  const customModifiers = new Map([["c", { active: true, value: -1, kind: "numeric" }]]);
  assert.equal(calculateSkillModifierTotal({ residual: 1, systemModifiers, customModifiers }), 2);
});

test("armor includes gear-bonus modifiers in the final Gear dice pool", () => {
  const systemModifiers = [
    { checked: true, value: 1, gearBonus: false, artifactCounts: emptyArtifacts },
    { checked: true, value: 2, gearBonus: true, artifactCounts: emptyArtifacts }
  ];
  assert.equal(calculateArmorDiceTotal({ armor: 4, systemModifiers }), 7);
});

test("armor half uses the configured rounding mode after all adjustments", () => {
  assert.equal(calculateArmorDiceTotal({ armor: 5, factor: 0.5, rounding: "floor" }), 2);
  assert.equal(calculateArmorDiceTotal({ armor: 5, factor: 0.5, rounding: "ceil" }), 3);
  assert.equal(calculateArmorDiceTotal({ armor: 5, residual: 1, factor: 0.5, rounding: "floor" }), 3);
});
