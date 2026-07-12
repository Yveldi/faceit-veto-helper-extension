// Player-tracking background harvester (see PLAYER_TRACKING_SPEC.md). Builds a
// local record of who you've played with/against by reading your recent
// matchmaking matches and their rosters. It is the ONE feature allowed its own
// network requests, but they are all LOW priority: the rate-limit queue makes
// them yield to any Veto Helper load, so this never slows the Veto Helper down.
//
// Out of the React render path: a plain controller started/stopped by an effect
// in App on (playerTrackingEnabled && selfUserId).

import { faceitAPI, fetchMatchRounds, fetchWithRetry } from "../utils";
import {
  addMatch,
  getMeta,
  hasMatch,
  loadStore,
  setMeta,
} from "./store";

const storage =
  globalThis.chrome?.storage?.local ?? globalThis.browser?.storage?.local;

const COOLDOWN_MS = 15 * 60 * 1000; // 15-minute incremental cooldown
const LOCK_TTL_MS = 60 * 1000; // lease length; renewed via heartbeat
const LOCK_HEARTBEAT_MS = 20 * 1000;
const LIST_SIZE = 90;

// Per-tab id (only needs to be unique among open tabs; not persisted). Math.random
// is fine here — this is runtime code, not a workflow script.
const TAB_ID = `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;

let running = false;
let stopped = false;
let lockTimer = null;
let currentSelf = null;

function getLock() {
  return new Promise((resolve) => {
    if (!storage) return resolve(null);
    storage.get({ playerTrackingLock: null }, (i) =>
      resolve(i.playerTrackingLock),
    );
  });
}
function setLock(value) {
  return new Promise((resolve) => {
    if (!storage) return resolve();
    storage.set({ playerTrackingLock: value }, () => resolve());
  });
}

// Try to acquire (or take over an expired) lease. Returns true on success.
async function acquireLock() {
  const now = Date.now();
  const lock = await getLock();
  if (lock && lock.tabId !== TAB_ID && lock.expiresAt > now) return false;
  await setLock({ tabId: TAB_ID, expiresAt: now + LOCK_TTL_MS });
  // Re-read to reduce (not eliminate) the race: last writer wins.
  const confirm = await getLock();
  return confirm?.tabId === TAB_ID;
}

async function renewLock() {
  await setLock({ tabId: TAB_ID, expiresAt: Date.now() + LOCK_TTL_MS });
}

async function releaseLock() {
  const lock = await getLock();
  if (lock?.tabId === TAB_ID) await setLock(null);
}

// ISO end_time -> unix seconds.
function toUnixSeconds(iso) {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
}

// Deduped, matchmaking-only list entries (newest-first) from the self
// match-rounds list. Each: { matchId, date, score:[you,them] }.
function listFromRounds(rounds) {
  const seen = new Set();
  const out = [];
  for (const r of rounds) {
    if (r.match_type !== "matchmaking") continue;
    const matchId = r.match_id;
    if (!matchId || seen.has(matchId)) continue;
    seen.add(matchId);
    out.push({
      matchId,
      date: toUnixSeconds(r.end_time),
      score: [r.team_score ?? 0, r.opponent_team_score ?? 0],
    });
  }
  return out;
}

async function fetchRosters(matchId, signal) {
  const res = await fetchWithRetry(`${faceitAPI}/match/v2/match/${matchId}`, {
    signal,
    priority: "low",
  });
  return (await res.json()).payload;
}

// Split a match's rosters into teammates/opponents relative to self, using the
// list entry for date/score (match/v2 is only read for the rosters).
function recordFromPayload(payload, selfId, listEntry) {
  const teams = Object.values(payload.teams || {});
  let mine = null;
  let theirs = null;
  for (const team of teams) {
    const ids = (team.roster || []).map((p) => p.id);
    if (ids.includes(selfId)) mine = ids;
    else theirs = ids;
  }
  if (!mine || !theirs) return null;
  return {
    d: listEntry.date,
    s: listEntry.score,
    t: mine.filter((id) => id !== selfId),
    o: theirs,
  };
}

async function harvestOnce(selfId, signal) {
  await loadStore();
  const meta = getMeta();
  const now = Date.now();
  const incremental = meta.fullBackfillDone;

  // Incremental runs respect the cooldown; backfill ignores it.
  if (incremental && now - (meta.lastSyncAt || 0) < COOLDOWN_MS) return;

  const rounds = await fetchMatchRounds(
    { id: selfId },
    LIST_SIZE,
    signal,
    "low",
  );
  if (signal.aborted) return;
  const list = listFromRounds(rounds);

  for (const entry of list) {
    if (signal.aborted) return;
    if (hasMatch(entry.matchId)) {
      // Incremental: the stored set is a contiguous newest-run, so the first
      // known match means we've caught up. Backfill: skip and keep going (an
      // interrupted backfill leaves gaps we must fill).
      if (incremental) break;
      continue;
    }
    try {
      const payload = await fetchRosters(entry.matchId, signal);
      if (signal.aborted) return;
      const record = recordFromPayload(payload, selfId, entry);
      if (record) await addMatch(entry.matchId, record);
    } catch (err) {
      if (err?.name === "AbortError") return;
      // A single bad match must not abort the whole run.
      console.error("Faceit Veto Helper: harvest failed for a match", err);
    }
  }

  await setMeta({ fullBackfillDone: true, lastSyncAt: Date.now() });
}

async function runGuarded(selfId, signal) {
  if (running) return;
  running = true;
  const got = await acquireLock();
  if (!got) {
    running = false;
    return;
  }
  lockTimer = setInterval(renewLock, LOCK_HEARTBEAT_MS);
  try {
    await harvestOnce(selfId, signal);
  } finally {
    clearInterval(lockTimer);
    lockTimer = null;
    await releaseLock();
    running = false;
  }
}

// Public: start harvesting for `selfId`. Idempotent per self id. Runs once on
// start (backfill / catch-up); subsequent incremental runs are driven by
// `triggerHarvest()` (called when a match is found — see App), not a timer.
// The recently-encountered set only changes when the user plays a match, so
// there's nothing to poll for between matches.
export function startHarvester(selfId) {
  if (!selfId || !storage) return;
  if (currentSelf === selfId && !stopped) return;
  stopHarvester();
  stopped = false;
  currentSelf = selfId;

  const controller = new AbortController();
  const { signal } = controller;
  startHarvester._controller = controller;

  runGuarded(selfId, signal);
}

// Public: run an incremental harvest now (respecting the cooldown inside
// harvestOnce). Fired when a match is found, so newly-played matches are
// recorded near-instantly. No-op if the harvester isn't running.
export function triggerHarvest() {
  if (stopped || !currentSelf) return;
  const signal = startHarvester._controller?.signal;
  if (!signal) return;
  runGuarded(currentSelf, signal);
}

export function stopHarvester() {
  stopped = true;
  currentSelf = null;
  clearInterval(lockTimer);
  lockTimer = null;
  startHarvester._controller?.abort();
  startHarvester._controller = null;
  running = false;
}
