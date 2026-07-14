// Player-tracking storage + read API (see PLAYER_TRACKING_SPEC.md). Match-centric
// so eviction is trivial and there's no per-player duplication. Backed by
// chrome.storage.local, separate from settings (it's data, not preferences).
//
// Schema:
//   playerTrackingMatches = { [matchId]: { d, s:[you,them], m:map, t:[guid...], o:[guid...] } }
//   (`m` = the played map's class_name; absent on records harvested before it
//   was recorded, which the history popover tolerates.)
//   playerTrackingOrder   = [matchId, ...]  // newest-first; eviction tail
//   playerTrackingMeta    = { fullBackfillDone, lastSyncAt }
// An in-memory index (guid -> matchId[]) is derived on load for O(1) reads.

const storage =
  globalThis.chrome?.storage?.local ?? globalThis.browser?.storage?.local;

// Fixed 5 MB cap (a single constant). Sits safely under Chrome's ~10 MB
// storage.local quota, so no unlimitedStorage permission is needed.
const CAP_BYTES = 5 * 1024 * 1024;

// In-memory mirror, kept in step with storage.
let matches = {}; // matchId -> record
let order = []; // newest-first
let meta = { fullBackfillDone: false, lastSyncAt: 0 };
const index = new Map(); // guid -> matchId[] (newest-first order preserved)
const listeners = new Set();
let loaded = false;
let loadPromise = null;

function get(keys) {
  return new Promise((resolve) => {
    if (!storage) return resolve({});
    storage.get(keys, (items) => resolve(items || {}));
  });
}

function set(obj) {
  return new Promise((resolve) => {
    if (!storage) return resolve();
    storage.set(obj, () => resolve());
  });
}

function rebuildIndex() {
  index.clear();
  // Walk newest-first so each guid's list stays newest-first.
  for (const matchId of order) {
    const rec = matches[matchId];
    if (!rec) continue;
    for (const guid of [...(rec.t || []), ...(rec.o || [])]) {
      let list = index.get(guid);
      if (!list) index.set(guid, (list = []));
      list.push(matchId);
    }
  }
}

export function loadStore() {
  if (loaded) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = get({
    playerTrackingMatches: {},
    playerTrackingOrder: [],
    playerTrackingMeta: { fullBackfillDone: false, lastSyncAt: 0 },
  }).then((items) => {
    matches = items.playerTrackingMatches || {};
    order = items.playerTrackingOrder || [];
    meta = items.playerTrackingMeta || { fullBackfillDone: false, lastSyncAt: 0 };
    rebuildIndex();
    loaded = true;
  });
  return loadPromise;
}

export function getMeta() {
  return meta;
}

export async function setMeta(partial) {
  meta = { ...meta, ...partial };
  await set({ playerTrackingMeta: meta });
}

export function hasMatch(matchId) {
  return Object.prototype.hasOwnProperty.call(matches, matchId);
}

// Rough serialized byte size of the store (TextEncoder, not getBytesInUse which
// is unreliable on Firefox). GUIDs are ASCII so this is essentially exact.
function storeBytes() {
  const json = JSON.stringify({ m: matches, o: order });
  return new TextEncoder().encode(json).length;
}

// Evict from the oldest tail of `order` until back under the cap. Batched: mutate
// in memory, then one storage write.
function evictToFit() {
  let bytes = storeBytes();
  let evicted = false;
  while (bytes > CAP_BYTES && order.length > 0) {
    const oldest = order.pop();
    delete matches[oldest];
    evicted = true;
    // Re-measure occasionally rather than every iteration would be cheaper, but
    // records are tiny and eviction is rare; keep it simple and correct.
    bytes = storeBytes();
  }
  return evicted;
}

// Append (or overwrite) one match record and persist. Updates the in-memory
// index and notifies subscribers so live banners refresh.
export async function addMatch(matchId, record) {
  await loadStore();
  const isNew = !hasMatch(matchId);
  matches[matchId] = record;
  if (isNew) order.unshift(matchId);
  else order = [matchId, ...order.filter((id) => id !== matchId)];

  evictToFit();
  rebuildIndex();

  await set({
    playerTrackingMatches: matches,
    playerTrackingOrder: order,
  });
  listeners.forEach((cb) => cb());
}

// --- read API (for the card UI) --------------------------------------------

// { [guid]: { total, sameTeam, enemy } }. "Mixture" = sameTeam>0 && enemy>0.
export function getEncounters(guids) {
  const out = {};
  for (const guid of guids) {
    const ids = index.get(guid);
    if (!ids || ids.length === 0) {
      out[guid] = { total: 0, sameTeam: 0, enemy: 0 };
      continue;
    }
    let sameTeam = 0;
    let enemy = 0;
    for (const id of ids) {
      const rec = matches[id];
      if (!rec) continue;
      if ((rec.t || []).includes(guid)) sameTeam++;
      else if ((rec.o || []).includes(guid)) enemy++;
    }
    out[guid] = { total: sameTeam + enemy, sameTeam, enemy };
  }
  return out;
}

// [{ matchId, date, score, map, sameTeam }] newest-first for one player.
export function getPlayerHistory(guid) {
  const ids = index.get(guid);
  if (!ids) return [];
  return ids
    .map((id) => {
      const rec = matches[id];
      if (!rec) return null;
      return {
        matchId: id,
        date: rec.d,
        score: rec.s,
        map: rec.m || "",
        sameTeam: (rec.t || []).includes(guid),
      };
    })
    .filter(Boolean);
}

export function subscribeTracking(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
