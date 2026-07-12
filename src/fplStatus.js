// Content-script side of the FPL pipeline. `public/inject.js` (MAIN world) wraps
// the page's fetch/XHR and posts FACEIT's own `fpl/v1/users/details` response to
// us here. We never make that request — the matchroom fires it on load; we only
// read what it already loaded (the "no new network requests" rule).
//
// The response payload is a BARE ARRAY, with an entry ONLY for players who are
// on an FPL (FACEIT Pro League). Shape confirmed live:
//   { user_id, position, config_id, config_name }   e.g. position 70, "FPL Europe"
// Presence of an entry == the player is FPL. `position` is their ladder rank;
// `config_name` is "FPL <Region>", so we strip the "FPL " prefix for the region.

const CHANNEL = "fvh-fpl";

// guid -> { rank: number|null, region: string|null }
const fpl = new Map();
const listeners = new Set();
let installed = false;

function ingest(payload) {
  const rows = Array.isArray(payload) ? payload : payload ? [payload] : [];
  let changed = false;
  for (const row of rows) {
    const guid = row && row.user_id;
    if (!guid || typeof guid !== "string") continue;
    const rank = typeof row.position === "number" ? row.position : null;
    const region =
      typeof row.config_name === "string"
        ? row.config_name.replace(/^FPL\s+/i, "").trim() || null
        : null;
    fpl.set(guid, { rank, region });
    changed = true;
  }
  if (changed) listeners.forEach((cb) => cb());
}

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

// The FPL entry for a guid, or null if the player isn't on an FPL (or not seen
// yet). A non-null result means "show the FPL badge".
export function getFpl(guid) {
  return fpl.get(guid) ?? null;
}

// Subscribe to "a new FPL entry arrived"; returns an unsubscribe.
export function subscribeFpl(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
