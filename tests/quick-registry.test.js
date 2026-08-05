import test from "node:test";
import assert from "node:assert/strict";
import { getQuickModifierGroups } from "../scripts/services/quick-registry.js";

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
