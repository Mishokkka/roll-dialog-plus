import test from "node:test";
import assert from "node:assert/strict";
import { getQuickModifierGroups, registerQuickModifierGroup } from "../scripts/services/quick-registry.js";

test("unknown Quick registry types warn and return an isolated skill fallback", (t) => {
  const previousGame = globalThis.game;
  const warnings = [];
  globalThis.game = {
    settings: { get() { return false; } }
  };
  const previousWarn = console.warn;
  console.warn = (...args) => warnings.push(args);
  t.after(() => {
    console.warn = previousWarn;
    if (previousGame === undefined) delete globalThis.game;
    else globalThis.game = previousGame;
  });

  const first = getQuickModifierGroups("unknown-type");
  const second = getQuickModifierGroups("skill");
  assert.ok(warnings.length >= 1);
  assert.deepEqual(first, second);
  first[0].key = "mutated";
  assert.notEqual(getQuickModifierGroups("skill")[0].key, "mutated");
});

test("inherited property names are treated as unknown registry types", (t) => {
  const previousGame = globalThis.game;
  const previousWarn = console.warn;
  const warnings = [];
  globalThis.game = { settings: { get() { return false; } } };
  console.warn = (...args) => warnings.push(args);
  t.after(() => {
    console.warn = previousWarn;
    if (previousGame === undefined) delete globalThis.game;
    else globalThis.game = previousGame;
  });

  const skill = getQuickModifierGroups("skill");
  for (const type of ["constructor", "__proto__"]) {
    const fallback = getQuickModifierGroups(type);
    assert.deepEqual(fallback, skill);
    fallback[0].key = type;
    assert.notEqual(getQuickModifierGroups("skill")[0].key, type);
  }
  assert.equal(warnings.length, 2);
});

test("custom registries can safely use prototype-like names", () => {
  registerQuickModifierGroup({ key: "custom-proto", mode: "toggle", items: [] }, { type: "__proto__" });
  assert.equal(getQuickModifierGroups("__proto__")[0].key, "custom-proto");
});
