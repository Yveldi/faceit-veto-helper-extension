// Cross-browser settings backed by extension storage. The popup writes them;
// the content script reads them and reacts to changes via storage.onChanged.
// `chrome` exists in both Chrome and Firefox (Firefox also supports the
// callback form), so we don't need the webextension-polyfill here.

export const SETTINGS_DEFAULTS = {
  // Global master switch (the control panel header toggle). When off, EVERY
  // feature pauses at once (nothing is hidden, the individual toggles keep their
  // values) — the content script gates all features on this. On by default.
  globalEnabled: true,

  autoAcceptEnabled: true,
  // "One-time accept": arm once, auto-accept the next match, then disarm itself.
  // Ignored while autoAcceptEnabled is on (the permanent one wins). Off by
  // default. Cleared automatically after the accept it triggered.
  oneTimeAcceptEnabled: false,
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

  // Position Caller (see design_handoff_veto_helper/position-caller.md). Auto-
  // sends your per-map "call" to the matchroom Team chat when the map locks in.
  // Off by default: it posts messages on your behalf, so it's strictly opt-in.
  // Only ever acts in MATCHMAKING lobbies (entity.type === "matchmaking") — never
  // championships or 5-stack custom lobbies (calling positions to your friends
  // would be embarrassing). When enabled it always fires at whichever moment the
  // map becomes known — immediately if the lobby loads with the map already
  // decided (single-map / server-only-veto), else when the map veto concludes;
  // there's no per-trigger toggle. `spotDuo` sends a different call when queued as
  // a duo (see the duo fallback rule in the spec). The per-map calls themselves
  // live in the `spotCalls` storage key, not here (they're data, and change via
  // the editor, not a preference toggle).
  spotEnabled: false,
  spotDuo: false,
};

// The Position Caller map pool: the up-to-date active 7, NO Overpass, in the
// design's order. class_names, keyed into defaultMapThumbnail for thumbnails.
export const SPOT_MAP_IDS = [
  "de_dust2",
  "de_mirage",
  "de_nuke",
  "de_ancient",
  "de_inferno",
  "de_anubis",
  "de_cache",
];

// Per-map call config: { on, msg, duoMsg } for each pool map. Default every map
// ON but with EMPTY messages — so enabling the feature sends nothing until the
// user actually writes calls (a map with no message is skipped). `duoMsg` blank
// means "use the solo call for duos too".
export function spotCallsDefaults() {
  return Object.fromEntries(
    SPOT_MAP_IDS.map((id) => [id, { on: true, msg: "", duoMsg: "" }]),
  );
}

// Load the per-map calls, reconciled against the current pool (drops maps no
// longer in the pool, adds any new pool maps with defaults).
export function loadSpotCalls() {
  return new Promise((resolve) => {
    const defaults = spotCallsDefaults();
    if (!storage) return resolve(defaults);
    storage.get({ spotCalls: null }, (items) => {
      const stored = items.spotCalls || {};
      const merged = {};
      for (const id of SPOT_MAP_IDS) {
        const s = stored[id] || {};
        merged[id] = {
          on: typeof s.on === "boolean" ? s.on : true,
          msg: typeof s.msg === "string" ? s.msg : "",
          duoMsg: typeof s.duoMsg === "string" ? s.duoMsg : "",
        };
      }
      resolve(merged);
    });
  });
}

export function saveSpotCalls(calls) {
  if (storage && calls) storage.set({ spotCalls: calls });
}

// Cross-reload / cross-tab "already fired for this match" flag. Storing just the
// last match id is enough: we only ever ask "did I already call for THIS match?",
// and it flips to allow again the moment the match changes. Persisted so a reload
// of the same room (or a second tab that loads it) doesn't re-send.
export function markSpotFired(matchId) {
  if (storage && matchId) storage.set({ spotFiredMatch: matchId });
}

export function getSpotFiredMatch() {
  return new Promise((resolve) => {
    if (!storage) return resolve(null);
    storage.get({ spotFiredMatch: null }, (items) =>
      resolve(items.spotFiredMatch),
    );
  });
}

// The control panel can't host the 620px editor (the toolbar popup is tiny and
// closes on blur), so "Set map calls" pings this key; the content script (running
// on whatever faceit.com tab is focused) opens the editor in response.
export function pingSpotEditor() {
  if (storage) storage.set({ spotEditorPing: Date.now() });
}

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
