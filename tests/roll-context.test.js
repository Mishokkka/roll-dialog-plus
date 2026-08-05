import test from "node:test";
import assert from "node:assert/strict";
import {
  clearExpiredRollContexts,
  consumePendingRollContext,
  discardPendingRollContext,
  setPendingRollContext
} from "../scripts/roll-context.js";

globalThis.game = { user: { id: "user-test" } };

test("pending contexts are queued instead of overwritten", () => {
  const first = setPendingRollContext({ userId: "queue-user", actorId: "a", marker: 1 });
  const second = setPendingRollContext({ userId: "queue-user", actorId: "b", marker: 2 });
  assert.notEqual(first, second);
  assert.equal(consumePendingRollContext({ userId: "queue-user", actorId: "b" }).marker, 2);
  assert.equal(consumePendingRollContext({ userId: "queue-user", actorId: "a" }).marker, 1);
});

test("a pending context can be discarded by nonce", () => {
  const nonce = setPendingRollContext({ userId: "discard-user", marker: 3 });
  discardPendingRollContext(nonce, "discard-user");
  assert.equal(consumePendingRollContext({ userId: "discard-user" }), null);
});

test("actor-bound context is not consumed by an actorless roll", () => {
  setPendingRollContext({ userId: "actorless-user", actorId: "actor-a", marker: 4 });
  assert.equal(consumePendingRollContext({ userId: "actorless-user" }), null);
  assert.equal(consumePendingRollContext({ userId: "actorless-user", actorId: "actor-a" }).marker, 4);
});

test("cleanup is safe with an empty store", () => {
  assert.doesNotThrow(() => clearExpiredRollContexts());
});

test("exact actor context is preferred over an earlier actorless fallback", () => {
  setPendingRollContext({ userId: "priority-user", marker: "fallback" });
  setPendingRollContext({ userId: "priority-user", actorId: "actor-exact", marker: "exact" });
  assert.equal(consumePendingRollContext({ userId: "priority-user", actorId: "actor-exact" }).marker, "exact");
  assert.equal(consumePendingRollContext({ userId: "priority-user", actorId: "other-actor" }).marker, "fallback");
});


test("parallel dialogs for one actor are matched by item, skill, attribute and title metadata", () => {
  setPendingRollContext({
    userId: "parallel-user",
    actorId: "actor-a",
    tokenId: "token-a",
    itemId: "item-sword",
    rollType: "parry",
    skillKey: "melee",
    selectedAttribute: "strength",
    title: "Parry",
    marker: "parry"
  });
  setPendingRollContext({
    userId: "parallel-user",
    actorId: "actor-a",
    tokenId: "token-a",
    itemId: "item-bow",
    rollType: "skill",
    skillKey: "marksmanship",
    selectedAttribute: "agility",
    title: "Marksmanship",
    marker: "shot"
  });

  const shot = consumePendingRollContext({
    userId: "parallel-user",
    actorId: "actor-a",
    tokenId: "token-a",
    itemId: "item-bow",
    rollType: "skill",
    skillKey: "marksmanship",
    attribute: "agility",
    title: "Marksmanship"
  });
  assert.equal(shot.marker, "shot");

  const parry = consumePendingRollContext({
    userId: "parallel-user",
    actorId: "actor-a",
    tokenId: "token-a",
    itemId: "item-sword",
    rollType: "parry",
    skillKey: "melee",
    attribute: "strength",
    title: "Parry"
  });
  assert.equal(parry.marker, "parry");
});

test("pending context queues retain only the ten newest entries per user", () => {
  for (let index = 0; index < 11; index += 1) {
    setPendingRollContext({ userId: "bounded-user", actorId: `actor-${index}`, marker: index });
  }
  assert.equal(consumePendingRollContext({ userId: "bounded-user", actorId: "actor-0" }), null);
  assert.equal(consumePendingRollContext({ userId: "bounded-user", actorId: "actor-10" })?.marker, 10);
  for (let index = 1; index < 10; index += 1) {
    consumePendingRollContext({ userId: "bounded-user", actorId: `actor-${index}` });
  }
});
