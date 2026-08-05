import { MODULE_ID } from "../constants.js";
import { getSetting, SETTINGS } from "./settings.js";

const prefix = `${MODULE_ID} |`;

export const log = {
  debug(...args) {
    if (getSetting(SETTINGS.DEBUG, false)) console.debug(prefix, ...args);
  },
  info(...args) {
    console.info(prefix, ...args);
  },
  warn(...args) {
    console.warn(prefix, ...args);
  },
  error(...args) {
    console.error(prefix, ...args);
  }
};
