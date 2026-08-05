import { attachRollContextFlag } from "./chat-patch.js";
import { MODULE_ID, MODULE_VERSION } from "./constants.js";
import { log } from "./core/logging.js";
import { registerSettings } from "./core/settings.js";
import { calculateChanceAnalysis, calculateSuccessChance, calculateSuccessDistribution } from "./probability.js";
import { patchRollDialog } from "./roll-dialog.js";
import { clearExpiredRollContexts } from "./roll-context.js";
import { getQuickModifierGroups, registerQuickModifierGroup } from "./services/quick-registry.js";
import { getSpecialRollProfile, listSpecialRollProfiles, registerSpecialRollProfile } from "./services/special-rolls.js";

Hooks.once("init", () => {
  registerSettings();
  const module = game.modules.get(MODULE_ID);
  if (module) {
    module.api = Object.freeze({
      version: MODULE_VERSION,
      calculateChanceAnalysis,
      calculateSuccessChance,
      calculateSuccessDistribution,
      getQuickModifierGroups,
      registerQuickModifierGroup,
      getSpecialRollProfile,
      listSpecialRollProfiles,
      registerSpecialRollProfile,
      hooks: Object.freeze({
        prepare: "fblRollDialogPlusPrepare",
        beforeRoll: "fblRollDialogPlusBeforeRoll",
        attempted: "fblRollDialogPlusSubmissionAttempted",
        submitted: "fblRollDialogPlusRollSubmitted"
      })
    });
  }
});

Hooks.once("ready", () => {
  log.debug(`${MODULE_VERSION} ready`);
});

const onRenderApplication = (app, html) => {
  try {
    patchRollDialog(app, html);
  } catch (error) {
    log.error("Failed to patch roll dialog", error);
  }
};

Hooks.on("renderApplication", onRenderApplication);
Hooks.on("renderApplicationV2", onRenderApplication);

Hooks.on("createChatMessage", (message, options, userId) => {
  try {
    clearExpiredRollContexts();
    const data = message?.toObject?.() ?? {};
    attachRollContextFlag(message, data, options, userId);
  } catch (error) {
    log.error("Failed to confirm roll context", error);
  }
});


