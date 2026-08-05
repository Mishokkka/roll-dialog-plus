import test from "node:test";
import assert from "node:assert/strict";
import { attachRollContextFlag } from "../scripts/chat-patch.js";
import { ROLL_SUBMISSION_TIMEOUT_MS } from "../scripts/constants.js";
import { consumePendingRollContext, setPendingRollContext } from "../scripts/roll-context.js";
import { detectRollType } from "../scripts/services/roll-detection.js";
import { parseNumber } from "../scripts/utils.js";

function installGlobals(t, userId, hooks = null) {
  const previousGame = globalThis.game;
  const previousHooks = globalThis.Hooks;
  globalThis.game = { user: { id: userId } };
  if (hooks) globalThis.Hooks = hooks;
  t.after(() => {
    if (previousGame === undefined) delete globalThis.game;
    else globalThis.game = previousGame;
    if (previousHooks === undefined) delete globalThis.Hooks;
    else globalThis.Hooks = previousHooks;
  });
}

test("typographic minus and plus signs are parsed as signed integers", () => {
  assert.equal(parseNumber("−2"), -2);
  assert.equal(parseNumber("–3"), -3);
  assert.equal(parseNumber("＋4"), 4);
});

test("armor is detected from structured application data before localized titles", () => {
  assert.equal(detectRollType({ app: { options: { rollType: "armor" } }, title: "Protection" }), "armor");
  assert.equal(detectRollType({ app: { gear: { category: "armour" } }, title: "Custom" }), "armor");
  assert.equal(detectRollType({ app: { options: { rollType: "skill" } }, title: "Performance" }), "skill");
});

test("confirmed submission hook is emitted only for a matching roll ChatMessage", (t) => {
  const calls = [];
  installGlobals(t, "chat-user", { callAll(name, payload) { calls.push([name, payload]); } });
  setPendingRollContext({
    userId: "chat-user",
    actorId: "actor-a",
    rollType: "skill",
    skillKey: "move",
    selectedAttribute: "agility",
    marker: "expected"
  });

  attachRollContextFlag(
    { rolls: [{ options: { type: "skill", skillKey: "move", attribute: "agility" } }], speaker: { actor: "actor-a" } },
    {},
    {},
    "chat-user"
  );

  assert.deepEqual(calls.map(([name]) => name), [
    "fblRollDialogPlusContextConsumed",
    "fblRollDialogPlusRollSubmitted"
  ]);
  assert.equal(calls[1][1].context.marker, "expected");
});

test("non-roll chat messages cannot consume pending contexts", (t) => {
  const calls = [];
  installGlobals(t, "plain-chat-user", { callAll(name) { calls.push(name); } });
  setPendingRollContext({ userId: "plain-chat-user", actorId: "actor-a", marker: "still-pending" });
  attachRollContextFlag({ speaker: { actor: "actor-a" }, content: "hello" }, {}, {}, "plain-chat-user");
  assert.deepEqual(calls, []);
  assert.equal(
    consumePendingRollContext({ userId: "plain-chat-user", actorId: "actor-a" })?.marker,
    "still-pending"
  );
});

test("HTML that looks like a dice card is not treated as a roll without structured roll data", (t) => {
  installGlobals(t, "fake-roll-user", { callAll() { throw new Error("must not emit"); } });
  setPendingRollContext({ userId: "fake-roll-user", actorId: "actor-a", marker: "pending" });
  attachRollContextFlag(
    { speaker: { actor: "actor-a" }, content: '<div class="dice-roll"><div class="dice-result"></div></div>' },
    {},
    {},
    "fake-roll-user"
  );
  assert.equal(consumePendingRollContext({ userId: "fake-roll-user", actorId: "actor-a" })?.marker, "pending");
});

test("submission confirmation timeout allows slow Foundry clients", () => {
  assert.equal(ROLL_SUBMISSION_TIMEOUT_MS, 30_000);
});
