import test from "node:test";
import assert from "node:assert/strict";
import { attachRollContextFlag } from "../scripts/chat-patch.js";
import { setPendingRollContext } from "../scripts/roll-context.js";
import { detectRollType } from "../scripts/services/roll-detection.js";
import { SUBMISSION_TIMEOUT_MS } from "../scripts/services/submission-tracker.js";
import { parseNumber } from "../scripts/utils.js";

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

test("confirmed submission hook is emitted only for a matching roll ChatMessage", () => {
  const calls = [];
  globalThis.game = { user: { id: "chat-user" } };
  globalThis.Hooks = { callAll(name, payload) { calls.push([name, payload]); } };
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
  delete globalThis.Hooks;
  delete globalThis.game;
});

test("non-roll chat messages cannot consume pending contexts", () => {
  const calls = [];
  globalThis.game = { user: { id: "plain-chat-user" } };
  globalThis.Hooks = { callAll(name) { calls.push(name); } };
  setPendingRollContext({ userId: "plain-chat-user", actorId: "actor-a", marker: "still-pending" });
  attachRollContextFlag({ speaker: { actor: "actor-a" }, content: "hello" }, {}, {}, "plain-chat-user");
  assert.deepEqual(calls, []);
  delete globalThis.Hooks;
  delete globalThis.game;
});

test("submission confirmation timeout allows slow Foundry clients", () => {
  assert.equal(SUBMISSION_TIMEOUT_MS, 30_000);
});
