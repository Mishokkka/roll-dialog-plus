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

test("token-bound context is not consumed by a fully unbound roll", () => {
  setPendingRollContext({ userId: "token-bound-user", tokenId: "token-a", marker: "token" });
  assert.equal(consumePendingRollContext({ userId: "token-bound-user" }), null);
  assert.equal(consumePendingRollContext({ userId: "token-bound-user", tokenId: "token-a" }).marker, "token");
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

test("exact token metadata can recover a context when actor ids disagree", () => {
  setPendingRollContext({
    userId: "synthetic-token-user",
    actorId: "synthetic-actor",
    tokenId: "token-a",
    sceneId: "scene-a",
    marker: "synthetic"
  });
  const context = consumePendingRollContext({
    userId: "synthetic-token-user",
    actorId: "base-actor",
    tokenId: "token-a",
    sceneId: "scene-a"
  });
  assert.equal(context.marker, "synthetic");
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

test("exact token identity wins over a conflicting base-actor match", () => {
  setPendingRollContext({
    userId: "token-priority-user",
    actorId: "base-actor",
    tokenId: "token-b",
    sceneId: "scene-a",
    marker: "wrong-token"
  });
  setPendingRollContext({
    userId: "token-priority-user",
    actorId: "synthetic-actor",
    tokenId: "token-a",
    sceneId: "scene-a",
    marker: "right-token"
  });

  const context = consumePendingRollContext({
    userId: "token-priority-user",
    actorId: "base-actor",
    tokenId: "token-a",
    sceneId: "scene-a"
  });
  assert.equal(context.marker, "right-token");
});

test("matching token ids from different explicit scenes are not treated as the same token", () => {
  setPendingRollContext({
    userId: "scene-token-user",
    actorId: "actor-a",
    tokenId: "shared-token",
    sceneId: "scene-a",
    marker: "scene-a"
  });

  assert.equal(consumePendingRollContext({
    userId: "scene-token-user",
    actorId: "other-actor",
    tokenId: "shared-token",
    sceneId: "scene-b"
  }), null);
  assert.equal(consumePendingRollContext({
    userId: "scene-token-user",
    actorId: "actor-a",
    tokenId: "shared-token",
    sceneId: "scene-a"
  }).marker, "scene-a");
});

test("a token message cannot consume a different token context for the same actor", () => {
  setPendingRollContext({
    userId: "same-actor-different-token-user",
    actorId: "actor-a",
    tokenId: "token-a",
    sceneId: "scene-a",
    marker: "token-a"
  });

  assert.equal(consumePendingRollContext({
    userId: "same-actor-different-token-user",
    actorId: "actor-a",
    tokenId: "token-b",
    sceneId: "scene-a"
  }), null);
  assert.equal(consumePendingRollContext({
    userId: "same-actor-different-token-user",
    actorId: "actor-a",
    tokenId: "token-a",
    sceneId: "scene-a"
  }).marker, "token-a");
});

test("a token message can still match an actor-only context", () => {
  setPendingRollContext({
    userId: "actor-only-fallback-user",
    actorId: "actor-a",
    marker: "actor-only"
  });

  assert.equal(consumePendingRollContext({
    userId: "actor-only-fallback-user",
    actorId: "actor-a",
    tokenId: "token-a",
    sceneId: "scene-a"
  }).marker, "actor-only");
});
