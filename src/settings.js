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
  // Lock the Lobby Veto Helper window so it can't be dragged. Persisted and
  // reactive so the in-page lock icon and the control-panel toggle stay in sync.
  // The window position is persisted separately (key `vetoHelperPosition`), not
  // here, so it doesn't churn this reactive settings object on every drag.
  vetoHelperLocked: false,

  // Auto server & map veto (see AUTOVETO_SPEC.md). Off by default: it acts in
  // real ranked matches, and only when you are the captain.
  autoVetoEnabled: false,
  autoVetoDelay: 5, // seconds before each auto-ban, 1-27
  // Also auto-ban during the server phase. Off by default so server bans are
  // opt-in (maps only otherwise), avoiding accidental server bans.
  autoVetoServers: false,
  // Override #1 ("Remove worst maps first"): defer the preference pick when an
  // unprotected map's win odds are below it by at least `autoVetoWorstFirstGap`
  // percentage points (ban that worse map first; your pick happens next turn).
  autoVetoWorstFirstEnabled: false,
  autoVetoWorstFirstGap: 10,
  // Override #2 ("Don't protect losing maps"): a map in the keep/ban-last group
  // loses its protection when another available map beats its win odds by at
  // least `autoVetoProtectFloor` percentage points (a gap, not an absolute floor;
  // the key name is kept for storage compatibility).
  autoVetoProtectFloorEnabled: false,
  autoVetoProtectFloor: 10,
  // Map preference, three ordered groups (a map is in exactly one). Empty = use
  // the default pool, banned by win odds. Set via the popup's drag editor.
  autoVetoMapFirst: [], // ban these first, in order
  autoVetoMapDynamic: [], // ban these by win odds, lowest first
  autoVetoMapLast: [], // ban these last; the very bottom is the intended keep
  // Server preference, top = ban first, bottom = keep. Empty = shipped pool.
  autoVetoServerOrder: [],

  // Replace FACEIT's native matchroom roster with our own player cards. On by
  // default. Cards render from the shared match data (no new requests); flags +
  // cosmetics are read from FACEIT's own user-summary call.
  replacePlayerCards: true,
  // Show the per-player stats band (last-30 WIN/KILLS/K-D/K-R/ADR/HS%/RATING) on
  // our cards. On by default; a sub-option of replacePlayerCards.
  showPlayerCardStats: true,
  // Player tracking: quietly record who you've played with/against so the cards
  // can show a match-history chip. Off by default because, unlike the rest, it
  // makes its OWN background requests (a match/v2 per past match) — always behind
  // the Veto Helper (see PLAYER_TRACKING_SPEC.md).
  playerTrackingEnabled: false,
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

// Write a partial settings update (e.g. the in-page lock icon toggling
// `vetoHelperLocked`). Reactive readers (useSettings) pick it up via onChanged.
export function updateSettings(partial) {
  if (storage) storage.set(partial);
}

// The Lobby Veto Helper window position. Stored apart from settings (it's data,
// and changes on every drag) so it never re-renders settings consumers.
export function saveVetoHelperPosition(position) {
  if (storage) storage.set({ vetoHelperPosition: position });
}

export function loadVetoHelperPosition() {
  return new Promise((resolve) => {
    if (!storage) return resolve(null);
    storage.get({ vetoHelperPosition: null }, (items) =>
      resolve(items.vetoHelperPosition),
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
