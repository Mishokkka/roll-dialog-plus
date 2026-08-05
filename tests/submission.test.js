import test from "node:test";
import assert from "node:assert/strict";
import { submitNativeRoll } from "../scripts/services/roll-submitter.js";

test("cancelable beforeRoll hook can veto native submission", () => {
  let submitted = 0;
  globalThis.game = { user: { id: "submit-veto" } };
  globalThis.Hooks = {
    call(name) { return name !== "fblRollDialogPlusBeforeRoll"; },
    callAll() {},
    on() { return 1; },
    off() {}
  };
  const state = { isSubmitting: false, submissionCleanup: null };
  const result = submitNativeRoll({
    app: {}, form: {}, actor: null, payload: {}, context: { userId: "submit-veto" }, state,
    bridge: { submit() { submitted += 1; } },
    shell: { isConnected: true },
    setSubmittingUi() {}
  });
  assert.equal(result, false);
  assert.equal(submitted, 0);
  assert.equal(state.isSubmitting, false);
  delete globalThis.Hooks;
  delete globalThis.game;
});

test("successful native attempt emits Attempted but not confirmed Submitted", () => {
  const calls = [];
  globalThis.game = { user: { id: "submit-attempt" } };
  globalThis.Hooks = {
    call() { return true; },
    callAll(name, payload) { calls.push([name, payload]); },
    on() { return 7; },
    off() {}
  };
  const state = { isSubmitting: false, submissionCleanup: null };
  const bridge = {
    committed: false,
    submitCalls: 0,
    submit() { this.submitCalls += 1; },
    markFailed() {}
  };
  const result = submitNativeRoll({
    app: {}, form: {}, actor: null, payload: { base: 1 },
    context: { userId: "submit-attempt", actorId: "actor-a" },
    state, bridge, shell: { isConnected: true }, setSubmittingUi() {}
  });
  assert.equal(result, true);
  assert.equal(bridge.submitCalls, 1);
  assert.deepEqual(calls.map(([name]) => name), ["fblRollDialogPlusSubmissionAttempted"]);
  assert.ok(calls[0][1].context.nonce);
  state.submissionCleanup?.();
  delete globalThis.Hooks;
  delete globalThis.game;
});
