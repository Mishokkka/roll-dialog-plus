import { localize } from "../core/i18n.js";
import { log } from "../core/logging.js";
import { discardPendingRollContext, setPendingRollContext } from "../roll-context.js";
import { armSubmissionTracking } from "./submission-tracker.js";

/**
 * Shared submission path for skill, armor and special rolls.
 * Returns false when a cancelable beforeRoll hook vetoes the attempt.
 */
export function submitNativeRoll({
  app,
  form,
  actor,
  payload,
  context,
  state,
  bridge,
  shell,
  setSubmittingUi,
  failureLog = "Roll submission failed"
} = {}) {
  const hookPayload = { app, form, actor, payload, context };
  if (!callCancelableHook("fblRollDialogPlusBeforeRoll", hookPayload)) return false;

  state.isSubmitting = true;
  setSubmittingUi(shell, true);
  const nonce = setPendingRollContext(context);
  state.submissionCleanup = armSubmissionTracking({
    state,
    bridge,
    shell,
    nonce,
    onUnlock: () => setSubmittingUi(shell, false)
  });

  try {
    bridge.submit();
    callHook("fblRollDialogPlusSubmissionAttempted", {
      ...hookPayload,
      context: { ...context, nonce }
    });
    return true;
  } catch (error) {
    state.submissionCleanup?.();
    state.submissionCleanup = null;
    discardPendingRollContext(nonce);
    bridge.markFailed();
    state.isSubmitting = false;
    setSubmittingUi(shell, false);
    log.error(failureLog, error);
    globalThis.ui?.notifications?.error?.(
      localize("Dialog.SubmitFailed", "The roll could not be submitted. The dialog remains editable.")
    );
    return false;
  }
}

function callHook(name, payload) {
  try {
    globalThis.Hooks?.callAll?.(name, payload);
  } catch (error) {
    log.warn(`Hook '${name}' failed`, error);
  }
}

function callCancelableHook(name, payload) {
  try {
    if (typeof globalThis.Hooks?.call === "function") return Hooks.call(name, payload) !== false;
    globalThis.Hooks?.callAll?.(name, payload);
    return true;
  } catch (error) {
    log.warn(`Hook '${name}' failed`, error);
    return true;
  }
}
