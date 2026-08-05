import test from "node:test";
import assert from "node:assert/strict";
import { installLifecycleRestoration } from "../scripts/services/lifecycle-restoration.js";

test("reinstalling lifecycle restoration cleans up the previous patch first", (t) => {
  const previousHooks = globalThis.Hooks;
  const registered = [];
  globalThis.Hooks = {
    on(name) { registered.push(name); return registered.length; },
    off() {}
  };
  t.after(() => {
    if (previousHooks === undefined) delete globalThis.Hooks;
    else globalThis.Hooks = previousHooks;
  });

  let previousCleanupCalls = 0;
  const form = { _fblrpLifecycleCleanup() { previousCleanupCalls += 1; } };
  const app = { close() {} };
  const shell = { dataset: {} };
  const cleanup = installLifecycleRestoration({ app, form, shell, bridge: {} });

  assert.equal(previousCleanupCalls, 1);
  assert.equal(form._fblrpLifecycleCleanup, cleanup);
  assert.equal(app.__fblrpLifecycleCleanup, cleanup);
  assert.equal(shell.dataset.fblrpLifecycle, "installed");
  assert.deepEqual(registered, ["closeApplication", "closeApplicationV2"]);
  cleanup();
  assert.equal(form._fblrpLifecycleCleanup, undefined);
  assert.equal(app.__fblrpLifecycleCleanup, undefined);
});

test("reinstalling on a new form cleans up the previous app lifecycle", (t) => {
  const previousHooks = globalThis.Hooks;
  globalThis.Hooks = { on() { return 1; }, off() {} };
  t.after(() => {
    if (previousHooks === undefined) delete globalThis.Hooks;
    else globalThis.Hooks = previousHooks;
  });

  const app = { close() {} };
  const firstForm = {};
  const firstCleanup = installLifecycleRestoration({ app, form: firstForm, shell: { dataset: {} }, bridge: {} });
  let firstCleanupCalls = 0;
  app.__fblrpLifecycleCleanup = () => {
    firstCleanupCalls += 1;
    firstCleanup();
  };

  const secondForm = {};
  const secondCleanup = installLifecycleRestoration({ app, form: secondForm, shell: { dataset: {} }, bridge: {} });
  assert.equal(firstCleanupCalls, 1);
  assert.equal(firstForm._fblrpLifecycleCleanup, undefined);
  assert.equal(app.__fblrpLifecycleCleanup, secondCleanup);
  secondCleanup();
});
