import { ROLL_SUBMISSION_TIMEOUT_MS } from "../constants.js";

/**
 * Restores native form state for every Foundry close path until the roll is
 * confirmed by a matching ChatMessage. The cleanup function is idempotent.
 */
export function installLifecycleRestoration({ app, appWindow, form, shell, bridge } = {}) {
  app?.__fblrpLifecycleCleanup?.();
  form?._fblrpLifecycleCleanup?.();
  let cleaned = false;
  const closeButton = appWindow?.querySelector?.(".header-button.close, [data-action='close']");
  const onCloseIntent = () => bridge?.requestCloseRestore?.({ delay: ROLL_SUBMISSION_TIMEOUT_MS });
  closeButton?.addEventListener?.("click", onCloseIntent, { capture: true });

  const hookIds = [];
  const registerHook = (name) => {
    if (!globalThis.Hooks?.on) return;
    const id = Hooks.on(name, (closedApp) => {
      if (closedApp !== app) return;
      bridge?.requestCloseRestore?.({ delay: ROLL_SUBMISSION_TIMEOUT_MS });
      cleanup();
    });
    hookIds.push([name, id]);
  };
  registerHook("closeApplication");
  registerHook("closeApplicationV2");

  let originalClose = null;
  let wrappedClose = null;
  if (app && typeof app.close === "function" && !app.__fblrpCloseWrapped) {
    originalClose = app.close;
    wrappedClose = function fblrpCloseWrapper(...args) {
      bridge?.requestCloseRestore?.({ delay: ROLL_SUBMISSION_TIMEOUT_MS });
      return originalClose.apply(this, args);
    };
    app.close = wrappedClose;
    app.__fblrpCloseWrapped = true;
  }

  const observer = typeof MutationObserver === "function" && appWindow?.parentNode
    ? new MutationObserver(() => {
        if (appWindow.isConnected) return;
        bridge?.requestCloseRestore?.({ delay: ROLL_SUBMISSION_TIMEOUT_MS });
        cleanup();
      })
    : null;
  observer?.observe(appWindow.parentNode, { childList: true });

  function cleanup() {
    if (cleaned) return;
    cleaned = true;
    closeButton?.removeEventListener?.("click", onCloseIntent, { capture: true });
    shell?._fblrpCancelProbability?.();
    if (shell) delete shell._fblrpCancelProbability;
    observer?.disconnect?.();
    for (const [name, id] of hookIds) globalThis.Hooks?.off?.(name, id);
    if (wrappedClose && app?.close === wrappedClose) {
      app.close = originalClose;
      delete app.__fblrpCloseWrapped;
    }
    if (form?._fblrpLifecycleCleanup === cleanup) delete form._fblrpLifecycleCleanup;
    if (app?.__fblrpLifecycleCleanup === cleanup) delete app.__fblrpLifecycleCleanup;
  }

  if (form) form._fblrpLifecycleCleanup = cleanup;
  if (app) app.__fblrpLifecycleCleanup = cleanup;
  if (shell?.dataset) shell.dataset.fblrpLifecycle = "installed";
  return cleanup;
}
