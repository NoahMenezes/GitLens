// SelectBeam Bridge — background script (Firefox scripts + Chrome SW compatible).
// Minimal: sets storage defaults on install. Heartbeat + polling live in
// content.js so each chat tab self-registers (no tab enumeration needed).
// No network calls here, no dependencies.

const DEFAULTS = { token: "", port: 51337 };

function getApi() {
  // Firefox exposes `browser`, Chrome exposes `chrome`. Both work here.
  if (typeof browser !== "undefined" && browser.runtime) {
    return browser;
  }
  return chrome;
}

try {
  const api = getApi();
  if (api.runtime && api.runtime.onInstalled) {
    api.runtime.onInstalled.addListener(async () => {
      try {
        const cur = await api.storage.local.get(DEFAULTS);
        const next = { ...DEFAULTS, ...cur };
        await api.storage.local.set(next);
      } catch {
        // storage unavailable (private mode?) — popup still works per-tab.
      }
    });
  }
} catch {
  // Content-script-only environments — safe to ignore.
}
