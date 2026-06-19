// Cross-browser settings backed by extension storage. The popup writes them;
// the content script reads them and reacts to changes via storage.onChanged.
// `chrome` exists in both Chrome and Firefox (Firefox also supports the
// callback form), so we don't need the webextension-polyfill here.

export const SETTINGS_DEFAULTS = {
  autoAcceptEnabled: true,
  autoAcceptDelay: 10, // seconds, 1–27
  vetoHelperEnabled: true,
  // "Veto Regret Helper™": only affects single-map lobbies (nothing to ban).
  // When on, show the full default pool instead of just the one map, so you can
  // see your win probability on maps you can't play. Off by default; useless.
  regretHelperEnabled: false,
  // Always show the full default pool, regardless of how many maps are bannable
  // (overrides regretHelperEnabled). Off by default.
  regretHelperAlways: false,

  // Auto server & map veto (see AUTOVETO_SPEC.md). Off by default: it acts in
  // real ranked matches, and only when you are the captain.
  autoVetoEnabled: false,
  autoVetoDelay: 5, // seconds before each auto-ban, 1-27
  // Also auto-ban during the server phase. Off by default so server bans are
  // opt-in (maps only otherwise), avoiding accidental server bans.
  autoVetoServers: false,
  // Win-rate override: ban the lowest-win-odds map instead of the preference
  // pick when the gap is at least `autoVetoTolerance` percentage points.
  autoVetoToleranceEnabled: false,
  autoVetoTolerance: 10,
  // Map preference, three ordered groups (a map is in exactly one). Empty = use
  // the default pool, banned by win odds. Set via the popup's drag editor.
  autoVetoMapFirst: [], // ban these first, in order
  autoVetoMapDynamic: [], // ban these by win odds, lowest first
  autoVetoMapLast: [], // ban these last; the very bottom is the intended keep
  // Server preference, top = ban first, bottom = keep. Empty = shipped pool.
  autoVetoServerOrder: [],
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

// Cache the logged-in user's own per-map stats (raw getPlayerStats shape:
// { map: [avgRating, winRate, count] }), refreshed each time the Veto Helper
// loads. Groundwork for auto-veto's fallback when this match's win probability
// is unknown. Stored separately from settings (it's data, not a preference).
export function saveSelfMapStats(stats) {
  if (storage && stats) storage.set({ selfMapStats: stats });
}

// Loads the cached self per-map stats (or null). Used by auto-veto as the win
// value fallback when the current match's win probabilities aren't available.
export function loadSelfMapStats() {
  return new Promise((resolve) => {
    if (!storage) return resolve(null);
    storage.get({ selfMapStats: null }, (items) => resolve(items.selfMapStats));
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
