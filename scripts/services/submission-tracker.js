import { localize } from "../core/i18n.js";
import { log } from "../core/logging.js";
import { discardPendingRollContext } from "../roll-context.js";

export const SUBMISSION_TIMEOUT_MS = 30_000;

export function armSubmissionTracking({ state, bridge, shell, nonce, onUnlock = null, timeoutMs = SUBMISSION_TIMEOUT_MS } = {}) {
  let active = true;
  let hookId = null;
  let timeoutId = null;
  const startedAt = Date.now();

  const cleanup = () => {
    if (!active) return;
    active = false;
    if (hookId != null) globalThis.Hooks?.off?.("fblRollDialogPlusContextConsumed", hookId);
    if (timeoutId != null) globalThis.clearTimeout?.(timeoutId);
    if (state?.submissionCleanup === cleanup) state.submissionCleanup = null;
  };

  if (globalThis.Hooks?.on) {
    hookId = Hooks.on("fblRollDialogPlusContextConsumed", (data) => {
      if (!active || !nonce || data?.nonce !== nonce) return;
      bridge.markCommitted();
      log.debug("Roll submission confirmed by ChatMessage", {
        nonce,
        elapsedMs: Date.now() - startedAt,
        actorId: data?.actorId ?? null,
        messageId: data?.message?.id ?? data?.message?._id ?? null
      });
      cleanup();
    });
  }

  timeoutId = globalThis.setTimeout?.(() => {
    if (!active || bridge.committed) return;
    cleanup();
    discardPendingRollContext(nonce);
    bridge.markFailed();
    if (state) state.isSubmitting = false;
    log.debug("Roll submission confirmation timed out", {
      nonce,
      elapsedMs: Date.now() - startedAt,
      shellConnected: !!shell?.isConnected
    });
    if (shell?.isConnected) {
      onUnlock?.();
      globalThis.ui?.notifications?.warn?.(localize("Dialog.SubmitTimeout", "No roll message was created. The dialog has been unlocked."));
    } else {
      bridge.requestCloseRestore({ delay: 0 });
    }
  }, timeoutMs);

  return cleanup;
}
