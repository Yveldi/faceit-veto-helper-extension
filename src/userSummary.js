// Content-script side of the cosmetics/flags pipeline. `public/inject.js` runs
// in the page's MAIN world, wraps the page's fetch/XHR, and posts FACEIT's own
// `user-summary/v2/list` response to us here. We never make that request — we
// only read what FACEIT already loaded (the extension's "no new network
// requests for loading the page" rule). See PlayerCard.MD for the response
// shape.
//
// We accumulate a guid -> { country, frame, animatedFrame, profileBg } map and
// let components subscribe so cards re-render as summaries arrive (they may land
// just before or after our roster mounts, depending on timing).

const CHANNEL = "fvh-user-summary";

// guid -> parsed summary
const summaries = new Map();
const listeners = new Set();
let installed = false;

// Pull the bits our cards use out of one user's summary entry.
function parseEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  const country =
    typeof entry.country === "string" ? entry.country.toLowerCase() : null;
  // Verified / VIP status for the name checkmark (white vs golden).
  const verificationLevel =
    typeof entry.verification_level === "number"
      ? entry.verification_level
      : typeof entry.verification?.level === "number"
        ? entry.verification.level
        : null;

  let frame = null;
  let animatedFrame = null;
  let profileBg = null;
  let animatedProfileBg = null;
  const items = Array.isArray(entry.active_cosmetic_items)
    ? entry.active_cosmetic_items
    : [];
  for (const item of items) {
    const sub = item?.subcategory;
    const props = item?.cosmetic_properties;
    if (!sub || !props) continue;
    if (String(sub).toLowerCase() === "avatar_frames" && props.avatar_frame) {
      frame = props.avatar_frame.frame_small_url || null;
      animatedFrame = props.avatar_frame.animated_frame_small_url || null;
    } else if (
      String(sub).toLowerCase() === "profile_cards" &&
      props.profile_card
    ) {
      profileBg =
        props.profile_card.matchroom_url ||
        props.profile_card.background_url ||
        null;
      animatedProfileBg = props.profile_card.animated_matchroom_url || null;
    }
  }
  return {
    country,
    verificationLevel,
    frame,
    animatedFrame,
    profileBg,
    animatedProfileBg,
  };
}

function ingest(payload) {
  if (!payload || typeof payload !== "object") return;
  let changed = false;
  for (const guid of Object.keys(payload)) {
    const parsed = parseEntry(payload[guid]);
    if (parsed) {
      summaries.set(guid, parsed);
      changed = true;
    }
  }
  if (changed) listeners.forEach((cb) => cb());
}

// Install the window message listener exactly once. Safe to call from module
// import time (content script only).
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

// The parsed summary for a guid, or null if not seen yet.
export function getUserSummary(guid) {
  return summaries.get(guid) ?? null;
}

// Subscribe to "a new summary arrived"; returns an unsubscribe.
export function subscribeUserSummary(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
