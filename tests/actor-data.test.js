import test from "node:test";
import assert from "node:assert/strict";
import {
  getActorAttributeValues,
  inferCurrentAttribute,
  inferSkillKey,
  readActorRollModifiersByIdentifiers,
  resolveActorFromApp,
  resolveCurrentAttributeKey
} from "../scripts/actor-data.js";

function restoreGlobal(t, key) {
  const previous = globalThis[key];
  t.after(() => {
    if (previous === undefined) delete globalThis[key];
    else globalThis[key] = previous;
  });
}

test("unknown attribute labels do not silently become Strength", () => {
  assert.equal(inferCurrentAttribute("Custom attribute"), null);
  assert.equal(resolveCurrentAttributeKey({}, null, "Custom attribute"), null);
});

test("explicit native handler attribute wins over translated labels", () => {
  assert.equal(resolveCurrentAttributeKey({ base: { name: "agility" } }, null, "Нестандартная подпись"), "agility");
  assert.equal(resolveCurrentAttributeKey({ base: { name: "wits" } }, null, "Strength"), "wits");
});

test("exact localized attribute matches win before substring aliases", (t) => {
  restoreGlobal(t, "game");
  globalThis.game = {
    i18n: {
      localize(key) {
        if (key.endsWith("Attribute.Wits")) return "Magic";
        return key;
      }
    }
  };
  assert.equal(inferCurrentAttribute("Magic"), "wits");
});

test("blank and null actor values fall through to later numeric candidates", () => {
  const actor = {
    system: {
      attribute: { strength: { value: "", max: null } },
      attributes: { strength: { value: 4 } }
    }
  };
  assert.equal(getActorAttributeValues(actor, "Strength", 2, "strength").strength, 4);
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

test("Gear modifier display uses the active module localization", (t) => {
  restoreGlobal(t, "game");
  globalThis.game = {
    i18n: {
      localize(key) {
        if (key.endsWith("Common.Gear")) return "Снаряжение";
        return key;
      }
    }
  };
  const actor = {
    getRollModifierOptions() {
      return [{ name: "Fine tool", value: 2, id: "tool", gearBonus: true }];
    }
  };
  const [modifier] = readActorRollModifiersByIdentifiers(actor, ["crafting"], []);
  assert.equal(modifier.display, "Снаряжение +2");
});

test("actor resolution never borrows an unrelated controlled token", (t) => {
  restoreGlobal(t, "canvas");
  restoreGlobal(t, "game");
  const unrelatedActor = { documentName: "Actor", id: "wrong" };
  globalThis.canvas = { tokens: { controlled: [{ actor: unrelatedActor }], get() { return null; } } };
  globalThis.game = { actors: { get() { return null; } } };
  const resolution = resolveActorFromApp({}, { dataset: {} });
  assert.equal(resolution.actor, null);
  assert.equal(resolution.source, "unresolved");
});

test("speaker token remains a precise actor source", (t) => {
  restoreGlobal(t, "canvas");
  restoreGlobal(t, "game");
  const actor = { documentName: "Actor", id: "actor-a" };
  globalThis.canvas = { tokens: { get(id) { return id === "token-a" ? { actor } : null; } } };
  globalThis.game = { actors: { get() { return null; } } };
  const resolution = resolveActorFromApp({ speaker: { token: "token-a" } }, { dataset: {} });
  assert.equal(resolution.actor, actor);
  assert.equal(resolution.source, "speaker.token");
});

test("speaker token actor wins over the base world actor", (t) => {
  restoreGlobal(t, "canvas");
  restoreGlobal(t, "game");
  const baseActor = { documentName: "Actor", id: "actor-a", name: "Base" };
  const syntheticActor = { documentName: "Actor", id: "actor-a", name: "Synthetic" };
  globalThis.canvas = { tokens: { get(id) { return id === "token-a" ? { actor: syntheticActor } : null; } } };
  globalThis.game = { actors: { get(id) { return id === "actor-a" ? baseActor : null; } } };

  const resolution = resolveActorFromApp({ speaker: { actor: "actor-a", token: "token-a" } }, { dataset: {} });
  assert.equal(resolution.actor, syntheticActor);
  assert.equal(resolution.source, "speaker.token");
});

test("off-canvas scene tokens can resolve their synthetic actor", (t) => {
  restoreGlobal(t, "canvas");
  restoreGlobal(t, "game");
  const actor = { documentName: "Actor", id: "actor-scene" };
  globalThis.canvas = { tokens: { get() { return null; } } };
  globalThis.game = {
    scenes: {
      get(id) {
        return id === "scene-a" ? { tokens: { get(tokenId) { return tokenId === "token-a" ? { actor } : null; } } } : null;
      }
    },
    actors: { get() { return null; } }
  };

  const resolution = resolveActorFromApp({ speaker: { scene: "scene-a", token: "token-a" } }, { dataset: {} });
  assert.equal(resolution.actor, actor);
  assert.equal(resolution.source, "scene.token");
});

test("prototype property names never escape the skill-label lookup", () => {
  assert.equal(inferSkillKey(null, "constructor"), "constructor");
  assert.equal(inferSkillKey(null, "__proto__"), "proto");
});

test("an explicitly named off-canvas scene is not confused with the active canvas token", (t) => {
  restoreGlobal(t, "canvas");
  restoreGlobal(t, "game");
  const canvasActor = { documentName: "Actor", id: "canvas-actor" };
  const sceneActor = { documentName: "Actor", id: "scene-actor" };
  globalThis.canvas = {
    scene: { id: "scene-active" },
    tokens: { get(id) { return id === "shared-token-id" ? { actor: canvasActor } : null; } }
  };
  globalThis.game = {
    scenes: {
      get(id) {
        return id === "scene-off-canvas"
          ? { tokens: { get(tokenId) { return tokenId === "shared-token-id" ? { actor: sceneActor } : null; } } }
          : null;
      }
    },
    actors: { get() { return null; } }
  };

  const resolution = resolveActorFromApp({ speaker: { scene: "scene-off-canvas", token: "shared-token-id" } }, { dataset: {} });
  assert.equal(resolution.actor, sceneActor);
  assert.equal(resolution.source, "scene.token");
});

test("an explicit scene never trusts a canvas token when canvas.scene is unavailable", (t) => {
  restoreGlobal(t, "canvas");
  restoreGlobal(t, "game");
  const canvasActor = { documentName: "Actor", id: "canvas-actor" };
  const sceneActor = { documentName: "Actor", id: "scene-actor" };
  globalThis.canvas = {
    scene: null,
    tokens: { get(id) { return id === "shared-token-id" ? { actor: canvasActor } : null; } }
  };
  globalThis.game = {
    scenes: {
      get(id) {
        return id === "scene-requested"
          ? { tokens: { get(tokenId) { return tokenId === "shared-token-id" ? { actor: sceneActor } : null; } } }
          : null;
      }
    },
    actors: { get() { return null; } }
  };

  const resolution = resolveActorFromApp({ speaker: { scene: "scene-requested", token: "shared-token-id" } }, { dataset: {} });
  assert.equal(resolution.actor, sceneActor);
  assert.equal(resolution.source, "scene.token");
});
