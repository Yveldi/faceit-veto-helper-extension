// Cross-browser settings backed by extension storage. The popup writes them;
// the content script reads them and reacts to changes via storage.onChanged.
// `chrome` exists in both Chrome and Firefox (Firefox also supports the
// callback form), so we don't need the webextension-polyfill here.

export const SETTINGS_DEFAULTS = {
  autoAcceptEnabled: true,
  autoAcceptDelay: 10, // seconds, 1–27
  // Up to 2 map ids (e.g. "de_overpass"). When the found match is a single one
  // of these, auto-accept is cancelled for it. Non-empty also makes auto-accept
  // wait until the map is known (see AutoAccept).
  autoAcceptBlockedMaps: [],
  vetoHelperEnabled: true,
  // "Veto Regret Helper™": only affects single-map lobbies (nothing to ban).
  // When on, show the full default pool instead of just the one map, so you can
  // see your win probability on maps you can't play. Off by default; useless.
  regretHelperEnabled: false,
};

const storage =
  globalThis.chrome?.storage?.local ?? globalThis.browser?.storage?.local;
const onChanged =
  globalThis.chrome?.storage?.onChanged ??
  globalThis.browser?.storage?.onChanged;

export function loadSettings() {
  return new Promise((resolve) => {
    if (!storage) return resolve({ ...SETTINGS_DEFAULTS });
    storage.get(SETTINGS_DEFAULTS, (items) =>
      resolve({ ...SETTINGS_DEFAULTS, ...items }),
    );
  });
}

// Calls `cb(changes)` whenever local storage changes. Returns an unsubscribe.
export function subscribeSettings(cb) {
  if (!onChanged) return () => {};
  const listener = (changes, area) => {
    if (area === "local") cb(changes);
  };
  onChanged.addListener(listener);
  return () => onChanged.removeListener(listener);
}
