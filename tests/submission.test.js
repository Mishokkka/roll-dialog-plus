import test from "node:test";
import assert from "node:assert/strict";
import { consumePendingRollContext } from "../scripts/roll-context.js";
import { submitNativeRoll } from "../scripts/services/roll-submitter.js";

function installGlobals(t, userId, hooks) {
  const previousGame = globalThis.game;
  const previousHooks = globalThis.Hooks;
  globalThis.game = { user: { id: userId } };
  globalThis.Hooks = hooks;
  t.after(() => {
    if (previousGame === undefined) delete globalThis.game;
    else globalThis.game = previousGame;
    if (previousHooks === undefined) delete globalThis.Hooks;
    else globalThis.Hooks = previousHooks;
  });
}

test("cancelable beforeRoll hook can veto native submission", (t) => {
  let submitted = 0;
  installGlobals(t, "submit-veto", {
    call(name) { return name !== "fblRollDialogPlusBeforeRoll"; },
    callAll() {},
    on() { return 1; },
    off() {}
  });
  const state = { isSubmitting: false, submissionCleanup: null };
  const result = submitNativeRoll({
    app: {}, form: {}, actor: null, payload: {}, context: { userId: "submit-veto" }, state,
    bridge: { committed: false, submit() { submitted += 1; } },
    shell: { isConnected: true },
    setSubmittingUi() {}
  });
  assert.equal(result, false);
  assert.equal(submitted, 0);
  assert.equal(state.isSubmitting, false);
});

test("successful native attempt emits Attempted but not confirmed Submitted", (t) => {
  const calls = [];
  installGlobals(t, "submit-attempt", {
    call() { return true; },
    callAll(name, payload) { calls.push([name, payload]); },
    on() { return 7; },
    off() {}
  });
  const state = { isSubmitting: false, submissionCleanup: null };
  const bridge = {
    committed: false,
    submitCalls: 0,
    submit() { this.submitCalls += 1; return true; },
    markFailed() {}
  };
  const result = submitNativeRoll({
    app: {}, form: {}, actor: null, payload: { base: 1 },
    context: { userId: "submit-attempt", actorId: "actor-a" },
    state, bridge, shell: { isConnected: true }, setSubmittingUi() {}
  });
  assert.equal(result, true);
  assert.equal(bridge.submitCalls, 1);
  assert.equal(state.isSubmitting, true);
  assert.deepEqual(calls.map(([name]) => name), ["fblRollDialogPlusSubmissionAttempted"]);
  assert.ok(calls[0][1].context.nonce);
  state.submissionCleanup?.();
});

test("committed bridges reject duplicate submissions before hooks or context tracking", (t) => {
  const calls = [];
  installGlobals(t, "submit-committed", {
    call(name) { calls.push(name); return true; },
    callAll(name) { calls.push(name); },
    on() { return 9; },
    off() {}
  });
  const state = { isSubmitting: false, submissionCleanup: null };
  const result = submitNativeRoll({
    context: { userId: "submit-committed", actorId: "actor-a" },
    state,
    bridge: { committed: true, submit() { throw new Error("must not run"); } },
    shell: { isConnected: true },
    setSubmittingUi() {}
  });
  assert.equal(result, false);
  assert.deepEqual(calls, []);
  assert.equal(state.isSubmitting, false);
  assert.equal(consumePendingRollContext({ userId: "submit-committed", actorId: "actor-a" }), null);
});

test("a native false result unlocks the dialog and discards pending context", (t) => {
  const calls = [];
  const uiStates = [];
  installGlobals(t, "submit-false", {
    call() { return true; },
    callAll(name) { calls.push(name); },
    on() { return 11; },
    off() {}
  });
  const state = { isSubmitting: false, submissionCleanup: null };
  const bridge = {
    committed: false,
    submit() { return false; },
    markFailedCalls: 0,
    markFailed() { this.markFailedCalls += 1; }
  };
  const result = submitNativeRoll({
    context: { userId: "submit-false", actorId: "actor-false" },
    state,
    bridge,
    shell: { isConnected: true },
    setSubmittingUi(_shell, value) { uiStates.push(value); }
  });
  assert.equal(result, false);
  assert.equal(state.isSubmitting, false);
  assert.equal(state.submissionCleanup, null);
  assert.equal(bridge.markFailedCalls, 1);
  assert.deepEqual(uiStates, [true, false]);
  assert.deepEqual(calls, []);
  assert.equal(consumePendingRollContext({ userId: "submit-false", actorId: "actor-false" }), null);
});

test("submission metadata prefers the resolved speaker over stale option token data", async (t) => {
  const { getDialogSubmissionMetadata } = await import("../scripts/roll-dialog.js");
  const metadata = getDialogSubmissionMetadata({
    app: {
      data: { speaker: { actor: "speaker-actor", token: "speaker-token", scene: "speaker-scene" } },
      options: { actorId: "option-actor", tokenId: "option-token", sceneId: "option-scene" }
    },
    form: { dataset: {} },
    actor: null,
    rollType: "skill",
    skillKey: "move",
    selectedAttribute: { key: "agility" },
    skillLabel: "Move"
  });

  assert.equal(metadata.actorId, "speaker-actor");
  assert.equal(metadata.tokenId, "speaker-token");
  assert.equal(metadata.sceneId, "speaker-scene");
});
