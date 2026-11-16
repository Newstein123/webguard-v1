/**
 * Device-local cache of user preferences. The account (user_settings table) is
 * the source of truth; this only makes the last choice available instantly on
 * load and keeps working if the account copy cannot be reached.
 */
const DEV_MODE_KEY = "webguard-developer-mode";

export function readCachedDeveloperMode(): boolean | null {
  try {
    const v = globalThis.localStorage?.getItem(DEV_MODE_KEY);
    return v === "1" ? true : v === "0" ? false : null;
  } catch {
    return null;
  }
}

export function writeCachedDeveloperMode(on: boolean) {
  try {
    globalThis.localStorage?.setItem(DEV_MODE_KEY, on ? "1" : "0");
  } catch {
    /* storage unavailable (private mode, blocked) */
  }
}
