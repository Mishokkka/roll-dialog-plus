import test from "node:test";
import assert from "node:assert/strict";
import { inferCurrentAttribute, readActorRollModifiersByIdentifiers, resolveActorFromApp, resolveCurrentAttributeKey } from "../scripts/actor-data.js";

test("unknown attribute labels do not silently become Strength", () => {
  assert.equal(inferCurrentAttribute("Custom attribute"), null);
  assert.equal(resolveCurrentAttributeKey({}, null, "Custom attribute"), null);
});

test("explicit native handler attribute wins over translated labels", () => {
  assert.equal(resolveCurrentAttributeKey({ base: { name: "agility" } }, null, "Нестандартная подпись"), "agility");
  assert.equal(resolveCurrentAttributeKey({ base: { name: "wits" } }, null, "Strength"), "wits");
});


test("official FBL artifact modifier shape preserves item identity and artifact die", () => {
  const actor = {
    getRollModifierOptions() {
      return [{ name: "Painter", value: "1d8", id: "talent-painter", type: "talent", gearBonus: false, active: false }];
    }
  };
  const [modifier] = readActorRollModifiersByIdentifiers(actor, ["performance", "empathy"], []);
  assert.equal(modifier.name, "Painter");
  assert.equal(modifier.value, 0);
  assert.equal(modifier.display, "D8");
  assert.deepEqual(modifier.artifactCounts, { d8: 1, d10: 0, d12: 0 });
  assert.equal(modifier.sourceId, "talent-painter");
  assert.equal(modifier.ruleKey, null);
  assert.equal(modifier.checked, false);
});


test("actor resolution never borrows an unrelated controlled token", () => {
  const unrelatedActor = { documentName: "Actor", id: "wrong" };
  globalThis.canvas = { tokens: { controlled: [{ actor: unrelatedActor }], get() { return null; } } };
  globalThis.game = { actors: { get() { return null; } } };
  const resolution = resolveActorFromApp({}, { dataset: {} });
  assert.equal(resolution.actor, null);
  assert.equal(resolution.source, "unresolved");
  delete globalThis.canvas;
  delete globalThis.game;
});

test("speaker token remains a precise actor source", () => {
  const actor = { documentName: "Actor", id: "actor-a" };
  globalThis.canvas = { tokens: { get(id) { return id === "token-a" ? { actor } : null; } } };
  globalThis.game = { actors: { get() { return null; } } };
  const resolution = resolveActorFromApp({ speaker: { token: "token-a" } }, { dataset: {} });
  assert.equal(resolution.actor, actor);
  assert.equal(resolution.source, "speaker.token");
  delete globalThis.canvas;
  delete globalThis.game;
});
