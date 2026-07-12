// Content-script side of the ESEA-league pipeline. `public/inject.js` runs in
// the page's MAIN world, wraps the page's fetch/XHR, and posts FACEIT's own
// `team-leagues/.../users:batchGetCurrent` response to us here. We never make
// that request — we only read what FACEIT already loaded (the extension's "no
// new network requests for loading the page" rule); the matchroom fires it on
// load for the roster's league-registered players.
//
// The response payload is a BARE ARRAY of per-user entries:
//   { user_id, league_name, division_name, region_name, placement_left?, ... }
// Only league-registered players appear (coverage is partial by nature). We
// accumulate a guid -> { league, division, region } map and let components
// subscribe so cards re-render as the data arrives.

const CHANNEL = "fvh-team-leagues";

// guid -> { league, division, region }
const leagues = new Map();
const listeners = new Set();
let installed = false;

function ingest(payload) {
  const rows = Array.isArray(payload) ? payload : payload ? [payload] : [];
  let changed = false;
  for (const row of rows) {
    const guid = row && row.user_id;
    if (!guid || typeof guid !== "string") continue;
    const division = typeof row.division_name === "string" ? row.division_name : null;
    if (!division) continue; // no meaningful league info to show
    leagues.set(guid, {
      league: typeof row.league_name === "string" ? row.league_name : "ESEA League",
      division,
      region: typeof row.region_name === "string" ? row.region_name : null,
    });
    changed = true;
  }
  if (changed) listeners.forEach((cb) => cb());
}

// Install the window message listener exactly once. Safe to call at import time
// (content script only).
function ensureInstalled() {
  if (installed) return;
  installed = true;
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== CHANNEL) return;
    ingest(data.payload);
  });
}

ensureInstalled();

// The league entry for a guid, or null if not seen yet.
export function getTeamLeague(guid) {
  return leagues.get(guid) ?? null;
}

// Subscribe to "a new league entry arrived"; returns an unsubscribe.
export function subscribeTeamLeague(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
