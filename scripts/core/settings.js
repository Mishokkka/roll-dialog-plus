import { MODULE_ID } from "../constants.js";

export const SETTINGS = Object.freeze({
  ENABLED: "enabled",
  DEBUG: "debug",
  SHOW_PUSH_PREVIEW: "showPushPreview",
  ARMOR_ROUNDING: "armorRounding"
});

/**
 * Registers the module settings used by the roll dialog.
 */
export function registerSettings() {
  const register = (key, data) => game.settings.register(MODULE_ID, key, data);

  register(SETTINGS.ENABLED, {
    name: "FBL_ROLL_DIALOG_PLUS.Settings.Enabled.Name",
    hint: "FBL_ROLL_DIALOG_PLUS.Settings.Enabled.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: true
  });

  register(SETTINGS.DEBUG, {
    name: "FBL_ROLL_DIALOG_PLUS.Settings.Debug.Name",
    hint: "FBL_ROLL_DIALOG_PLUS.Settings.Debug.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: false
  });

  register(SETTINGS.SHOW_PUSH_PREVIEW, {
    name: "FBL_ROLL_DIALOG_PLUS.Settings.ShowPushPreview.Name",
    hint: "FBL_ROLL_DIALOG_PLUS.Settings.ShowPushPreview.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true
  });

  register(SETTINGS.ARMOR_ROUNDING, {
    name: "FBL_ROLL_DIALOG_PLUS.Settings.ArmorRounding.Name",
    hint: "FBL_ROLL_DIALOG_PLUS.Settings.ArmorRounding.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      floor: "FBL_ROLL_DIALOG_PLUS.Settings.ArmorRounding.Floor",
      ceil: "FBL_ROLL_DIALOG_PLUS.Settings.ArmorRounding.Ceil",
      round: "FBL_ROLL_DIALOG_PLUS.Settings.ArmorRounding.Round"
    },
    default: "floor"
  });
}

/**
 * Reads a module setting and returns a fallback when Foundry is unavailable.
 */
export function getSetting(name, fallback = undefined) {
  try {
    if (!globalThis.game?.settings?.get) return fallback;
    const value = game.settings.get(MODULE_ID, name);
    return value ?? fallback;
  } catch (_error) {
    return fallback;
  }
}
