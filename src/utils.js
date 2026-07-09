// Same-origin because the content script runs on faceit.com — no CORS, no proxy needed
export const faceitAPI = "https://www.faceit.com/api";

// Single source of truth for the default map pool, shared with the popup (which
// fetches dist/mapPool.json). Update mapPool.json when the active pool changes
// and both the content script and the control panel follow. Keep thumbnails in
// the same file so the pool stays consistent.
import mapPool from "./mapPool.json";

export const defaultMapPool = mapPool.map((m) => m.id);
export const defaultMapThumbnail = Object.fromEntries(
  mapPool.map((m) => [m.id, m.thumbnail]),
);

export function sleep(seconds) {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

// Clamp a fixed-position {x,y} so the window stays FULLY on-screen for its
// CURRENT size, with a small `margin` gutter. `size` is the measured
// {width,height} of the currently-visible content (the window root itself has no
// size — both stage layers are absolutely positioned — so the caller measures the
// active layer and passes its rect here). Full containment, not a "keep 10% on
// screen" safety net: the live size is the only limit, so when the window grows
// (Stage 2 -> 3, or the body expanding) re-clamping pushes it inward to fit. If
// the content is larger than the viewport on an axis it pins to the top/left
// gutter (showing the window's origin). No-op without a size.
export function clampToViewport(pos, size, margin = 8) {
  if (!size) return pos;
  const { width: w, height: h } = size;
  const clampAxis = (v, s, viewport) =>
    Math.max(margin, Math.min(v, viewport - s - margin));
  return {
    x: clampAxis(pos.x, w, window.innerWidth),
    y: clampAxis(pos.y, h, window.innerHeight),
  };
}

export function prettifyMapName(mapName) {
  const prefixesToStrip = ["de_", "cs_"];
  const stripped = prefixesToStrip.some((prefix) => mapName.startsWith(prefix))
    ? mapName.replace(/^[a-z]+_/, "")
    : mapName.replace(/^[a-z]+_/, " ");

  return stripped
    .trim()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

const RATE_LIMIT_COOLDOWN_MS = 10_000;

// --- per-endpoint rate-limit lanes ------------------------------------------
// FACEIT rate-limits PER ENDPOINT, not globally: match-rounds (6 req / 20s) and
// the stats/time endpoint (~40 req / window) have INDEPENDENT budgets, so a 429
// (and its cooldown) on one must never hold up the other. Everything below is
// therefore keyed by a `bucket` string (default = the shared match/v2 +
// match-rounds lane; "time" = the fast wave-1 lane). Each bucket has its own
// serialization queue AND its own cooldown clock.
const DEFAULT_BUCKET = "default";
const queueChains = { [DEFAULT_BUCKET]: Promise.resolve() }; // bucket -> Promise
const earliestNextFetch = {}; // bucket -> timestamp floor

function bucketFloor(bucket) {
  return earliestNextFetch[bucket] ?? 0;
}

// Cross-tab rate-limit coordination. FACEIT applies its limit per account, not
// per tab, so two open faceit.com tabs each running their own queue would
// fire at twice the safe rate. We share only the cooldown CLOCK between tabs
// (not the requests — those stay in each tab's content script so they keep the
// same-origin cookie auth): whenever any tab reserves a slot or hits a 429, it
// broadcasts its new floor FOR THAT BUCKET, and every other tab pulls its own
// clock for that bucket forward to match. Each tab still serializes its own
// queue locally; the shared floor just stops tabs from overlapping. Buckets
// stay independent across tabs too. BroadcastChannel is supported in every
// browser we target (Firefox 109+, Chrome) but guarded for safety.
const rateLimitChannel =
  typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel("fvh-rate-limit")
    : null;

// Pull a bucket's local clock forward to a floor another tab announced (or any
// newer reservation). Only ever moves the clock later, never earlier.
function bumpEarliestNextFetch(bucket, ts) {
  if (ts > bucketFloor(bucket)) earliestNextFetch[bucket] = ts;
}

rateLimitChannel?.addEventListener("message", (event) => {
  const bucket = event.data?.bucket ?? DEFAULT_BUCKET;
  const ts = event.data?.earliestNextFetch;
  if (typeof ts === "number") bumpEarliestNextFetch(bucket, ts);
});

// Reserve the next slot for a bucket locally AND tell other tabs about it, so
// their queues on that bucket back off behind ours.
function reserveSlot(bucket, untilTs) {
  bumpEarliestNextFetch(bucket, untilTs);
  rateLimitChannel?.postMessage({
    bucket,
    earliestNextFetch: bucketFloor(bucket),
  });
}

// --- Veto-Helper priority lane ---------------------------------------------
// Player tracking harvests in the background and must NEVER slow a Veto Helper
// (match-data) load. We mark the Veto Helper's load region high-priority; low-
// priority (harvest) requests yield the queue to it, both within this tab (a
// counter) and across tabs (a busy BroadcastChannel, mirroring the rate-limit
// channel above).
let highPriorityCount = 0;
let remoteBusyUntil = 0;
const BUSY_HEARTBEAT_MS = 3_000;
// A remote "busy" is trusted until this long past the last heartbeat, so a
// crashed/closed tab clears itself instead of wedging harvesting forever.
const BUSY_TIMEOUT_MS = 8_000;
let busyHeartbeatTimer = null;

const vetoBusyChannel =
  typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel("fvh-veto-busy")
    : null;

vetoBusyChannel?.addEventListener("message", (event) => {
  if (event.data?.busy) remoteBusyUntil = Date.now() + BUSY_TIMEOUT_MS;
  else if (event.data?.busy === false) remoteBusyUntil = 0;
});

function broadcastBusy(busy) {
  vetoBusyChannel?.postMessage({ busy });
}

function isVetoBusy() {
  return highPriorityCount > 0 || Date.now() < remoteBusyUntil;
}

// Mark the start/end of a high-priority (Veto Helper) load region. Reference
// counted, so overlapping loads are handled. While active, re-broadcast busy on
// a heartbeat so other tabs keep deferring.
export function beginHighPriority() {
  highPriorityCount++;
  if (highPriorityCount === 1) {
    broadcastBusy(true);
    busyHeartbeatTimer = setInterval(
      () => broadcastBusy(true),
      BUSY_HEARTBEAT_MS,
    );
  }
}

export function endHighPriority() {
  if (highPriorityCount === 0) return;
  highPriorityCount--;
  if (highPriorityCount === 0) {
    clearInterval(busyHeartbeatTimer);
    busyHeartbeatTimer = null;
    broadcastBusy(false);
  }
}

// Wait until a bucket's cooldown floor has passed (the only wait we impose: a
// 429's retry-after, discovered after the fact and broadcast onto that bucket's
// clock). No proactive pacing otherwise.
async function waitBucketFloor(bucket) {
  while (Date.now() < bucketFloor(bucket)) {
    await sleep((bucketFloor(bucket) - Date.now()) / 1000);
  }
}

// Acquire a slot on `bucket`.
//   serialize=true  (default lane): one request in flight at a time, so a
//     discovered 429 wait holds back the requests behind it instead of them all
//     piling into the same 429. This is the match/v2 + match-rounds lane.
//   serialize=false (parallel lane): only honor the bucket's cooldown floor,
//     then fire immediately — N callers go out concurrently. Used by the fast
//     wave-1 "time" lane, whose endpoint tolerates ~40 req/window, so the whole
//     roster loads in one request's wall-clock time.
// Priority: a "low" acquirer (harvester) that reaches the front but finds a Veto
// Helper load in flight yields and re-queues, so a harvest request never sits
// even one slot ahead of a Veto Helper load. (Harvesting only uses the default
// serialized lane.)
async function acquireFetchSlot(priority, bucket, serialize) {
  for (;;) {
    if (serialize) {
      const prev = queueChains[bucket] ?? Promise.resolve();
      const myTurn = prev.then(() => waitBucketFloor(bucket));
      queueChains[bucket] = myTurn.catch(() => {});
      await myTurn;
    } else {
      await waitBucketFloor(bucket);
    }
    if (priority === "low" && isVetoBusy()) {
      // Yield and re-queue so any high-priority request goes ahead of us.
      await sleep(0.12);
      continue;
    }
    return;
  }
}

// Parse a Retry-After header. RFC 7231 allows either a delta-seconds integer or
// an HTTP-date; return the delay in milliseconds (>= 0), or null if absent/
// unparseable so the caller can fall back to its own backoff.
function parseRetryAfter(headerValue) {
  if (!headerValue) return null;
  const seconds = Number(headerValue);
  if (Number.isFinite(seconds)) return seconds > 0 ? seconds * 1000 : 0;
  const dateMs = Date.parse(headerValue);
  if (Number.isFinite(dateMs)) return Math.max(0, dateMs - Date.now());
  return null;
}

// FACEIT doesn't send the standard Retry-After on its 429s; it sends the IETF
// draft RateLimit headers instead: `ratelimit-retry-after` (delta-seconds until
// a slot frees) and `ratelimit-reset` (delta-seconds until the whole window
// resets). Prefer the shortest wait FACEIT gives us, in that order. The header
// has one-second granularity and "1" can mean "any moment up to a second from
// now", so pad it slightly so we don't retry a hair early and burn a slot on
// another 429.
const RATE_LIMIT_HEADER_PAD_MS = 10;

function rateLimitWaitMs(response) {
  const headers = response.headers;
  const fromHeader =
    parseRetryAfter(headers.get("Retry-After")) ??
    parseRetryAfter(headers.get("ratelimit-retry-after")) ??
    parseRetryAfter(headers.get("ratelimit-reset"));
  return fromHeader === null ? null : fromHeader + RATE_LIMIT_HEADER_PAD_MS;
}

// FACEIT's limiter is a leaky bucket: the `ratelimit-limit` header reads
// `6, 6;w=20` — 6 requests per 20s window, refilled one slot every w/limit
// seconds (~3.3s here). Crucially it reports `ratelimit-remaining: 0` on the
// SUCCESSFUL response that consumes the last slot. That zero is the limiter
// telling us the very next request will 429. Parse the limit/remaining pair so
// we can honour that warning proactively instead of firing blind into a
// guaranteed 429-retry-200 sawtooth. Returns { remaining, dripMs } or null when
// the headers are absent/unparseable.
function parseRateLimit(response) {
  const headers = response.headers;
  const remaining = Number(headers.get("ratelimit-remaining"));
  const limitHeader = headers.get("ratelimit-limit"); // e.g. "6, 6;w=20"
  if (!Number.isFinite(remaining) || !limitHeader) return null;

  // Limit count is the leading integer; window seconds come from `w=NN`.
  const limit = Number(limitHeader.trim().split(/[,;\s]/)[0]);
  const windowSec = Number(limitHeader.match(/w=(\d+)/)?.[1]);
  if (!Number.isFinite(limit) || limit <= 0 || !Number.isFinite(windowSec)) {
    return null;
  }

  // One slot refills every window/limit seconds. Pad so we retry a hair late
  // rather than a hair early and burn the fresh slot on another 429.
  const dripMs = (windowSec / limit) * 1000 + RATE_LIMIT_HEADER_PAD_MS;
  return { remaining, dripMs };
}

// After a request that DIDN'T 429, pace that bucket off the headers it returned.
// When the limiter says no slots remain, hold the next fetch on the bucket back
// by one drip interval so it lands on a refilled slot instead of a 429. When
// slots remain, do nothing — the queue is free to fire. Broadcast the floor so
// other tabs back off on the same bucket too (the limit is account-wide).
function paceFromResponse(response, bucket) {
  const info = parseRateLimit(response);
  if (info && info.remaining <= 0) {
    reserveSlot(bucket, Date.now() + info.dripMs);
  }
}

// `bucket` selects the per-endpoint rate-limit lane (default = match/v2 +
// match-rounds; "time" = the fast wave-1 stats lane). `serialize` false runs the
// request on the bucket's parallel lane (fire concurrently, honor only the
// cooldown floor) — used for the tolerant time endpoint so the whole roster's
// wave 1 goes out at once.
export async function fetchWithRetry(
  url,
  { signal, priority = "high", bucket = DEFAULT_BUCKET, serialize = true } = {},
) {
  const maxRetries = 10;
  const baseWaitTime = 4;
  const maxWaitTime = 20;
  const retryCodes = [429, 503, 502, 504];

  // Most 429s we see are transient collisions: our stats fetch lands in the
  // same instant as the page's own API calls or another extension's, the limit
  // trips for a fraction of a second, then clears. For those, a quick jittered
  // retry recovers far faster than the heavy account-wide cooldown — which we
  // reserve for a 429 that PERSISTS (a real sustained limit). So we count
  // consecutive 429s and only escalate after the transient retries fail.
  const TRANSIENT_429_RETRIES = 2;
  const TRANSIENT_429_BASE_MS = 300;
  let consecutive429 = 0;

  for (let i = 0; i < maxRetries; i++) {
    // Optional cancellation. Bail before taking a queue slot and again after,
    // so an aborted request never fires and frees the queue immediately. Timing
    // for normal (no-signal) callers is unchanged.
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    await acquireFetchSlot(priority, bucket, serialize);
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const response = await fetch(url, { signal });

    if (response.ok) {
      // Pace the NEXT request on this bucket off this success's headers: FACEIT
      // reports remaining=0 on the response that takes the last slot, so honour
      // that instead of firing straight into a guaranteed 429.
      paceFromResponse(response, bucket);
      return response;
    }
    if (response.status === 404) {
      return response;
    }
    if (!retryCodes.includes(response.status)) {
      throw new Error(`Request failed. Code: ${response.status}`);
    }

    if (response.status === 429) {
      consecutive429++;
      const retryAfterMs = rateLimitWaitMs(response);

      // FACEIT told us exactly how long to wait — always honour that, account-
      // wide, regardless of how transient it looked.
      if (retryAfterMs !== null) {
        reserveSlot(bucket, Date.now() + retryAfterMs);
        await sleep(retryAfterMs / 1000);
        continue;
      }

      // No Retry-After. Treat the first couple as transient: short jittered
      // backoff, and DON'T broadcast the account-wide cooldown (that would
      // stall every other tab for 10s over a sub-second blip). The jitter also
      // de-syncs our retry from whatever else is hammering the API so we don't
      // just collide again.
      if (consecutive429 <= TRANSIENT_429_RETRIES) {
        const jitter = 1 + Math.random();
        const waitMs = TRANSIENT_429_BASE_MS * 2 ** (consecutive429 - 1) * jitter;
        await sleep(waitMs / 1000);
        continue;
      }

      // Still rate-limited after the quick retries — this is a real sustained
      // limit. Now apply the heavy account-wide cooldown (for this bucket) so
      // all tabs back off.
      reserveSlot(bucket, Date.now() + RATE_LIMIT_COOLDOWN_MS);
      await sleep(RATE_LIMIT_COOLDOWN_MS / 1000);
      continue;
    }

    // Non-429 retryable code (5xx): the original exponential backoff.
    consecutive429 = 0;
    const backoff = Math.min(baseWaitTime * 2 ** i, maxWaitTime);
    await sleep(backoff);
  }
  throw new Error("Request timed out.");
}

export function matchID(input) {
  const regex =
    /1-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
  if (typeof input != "string") return null;
  return input.match(regex)?.[0] ?? null;
}

// Fetch a player's raw CS2 match-rounds (up to `noOfMatches`, newest first),
// concatenated across pages. This is the single network read behind BOTH the
// per-map stats (getPlayerStats) and the last-30 card stats (computeCardStats),
// so a card never costs an extra request — the caller fetches once and derives
// both. Each entry is one round object as FACEIT returns it (see the field
// candidates in computeCardStats).
export async function fetchMatchRounds(
  player,
  noOfMatches = 90,
  signal,
  priority = "high",
) {
  const maxMatchesPerFetch = 90;
  const rounds = [];

  const timesToFetch = Math.ceil(noOfMatches / maxMatchesPerFetch);
  const lastFetchAmount = noOfMatches % maxMatchesPerFetch;
  let offsetToken = 0;
  for (let i = 0; i < timesToFetch; i++) {
    if (signal?.aborted) break;
    try {
      const res = await fetchWithRetry(
        `${faceitAPI}/statistics/v1/cs2/players/${player.id}/match-rounds?${new URLSearchParams(
          {
            game_mode: "5v5",
            limit:
              lastFetchAmount != 0 && i === timesToFetch - 1
                ? lastFetchAmount
                : maxMatchesPerFetch,
            ...(offsetToken != 0 && { offset_token: offsetToken }),
          },
        )}`,
        { signal, priority },
      );
      const data = (await res.json()).payload;
      offsetToken = data.next_offset_token;
      for (const match of data.cs2.match_rounds) rounds.push(match);
    } catch (error) {
      // Let cancellation (a new match aborting this load) propagate quietly.
      if (error?.name === "AbortError") throw error;
      console.error(
        `Faceit Veto Helper: failed to fetch stats for ${player.nickname ?? player.id}`,
        error,
      );
    }
  }
  return rounds;
}

// Roll raw match-rounds into the per-map { map: [avgRating, winRate, count] }
// shape the Veto Helper consumes (unchanged output). Accepts either an already
// fetched rounds array or (legacy) fetches itself for a caller that only wants
// this.
export function computeMapStats(rounds) {
  const winRate = {};
  const faceitRating = {};
  for (const match of rounds) {
    if (typeof match.faceit_rating !== "number") continue;
    if (!faceitRating[match.map]) {
      faceitRating[match.map] = [];
      winRate[match.map] = [];
    }
    faceitRating[match.map].push(match.faceit_rating);
    winRate[match.map].push(match.win ? 100 : 0);
  }
  const finalFaceitRating = {};
  for (const map in faceitRating) {
    const wr =
      winRate[map].reduce((a, c) => a + c, 0) / winRate[map].length;
    finalFaceitRating[map] = [
      faceitRating[map].reduce((a, c) => a + c, 0) / faceitRating[map].length,
      wr,
      faceitRating[map].length,
    ]; // 0: Rating, 1: Winrate, 2: No of matches
  }
  return finalFaceitRating;
}

// Backward-compatible: fetch + build the per-map stats in one call.
export async function getPlayerStats(player, noOfMatches = 90, signal) {
  return computeMapStats(await fetchMatchRounds(player, noOfMatches, signal));
}

// First numeric value found under any of the candidate keys, else null.
function pickNum(obj, keys) {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

// Aggregate the last-N (default 30) match-rounds into the card's stats band:
// { win, kills, kd, kr, adr, hs, rating } — sums over the window divided by the
// proper denominator, or null if a source field is missing (card renders "-").
//
// Field names are CONFIRMED against a real `match-rounds` payload: each entry
// carries win, kills, deaths, damage, headshots, rounds_played (also team_score/
// opponent_team_score, kd, kr) and faceit_rating. We compute the ratios from the
// summed components (more accurate over the window than averaging per-match kd/kr).
export function computeCardStats(rounds, window = 30) {
  if (!rounds || rounds.length === 0) return null;
  const slice = rounds.slice(0, window);
  const n = slice.length;

  let wins = 0;
  let totKills = 0;
  let totDeaths = 0;
  let totRoundsPlayed = 0;
  let totHeadshots = 0;
  let totDamage = 0;
  let ratingSum = 0;
  let ratingCount = 0;
  let haveKills = false;
  let haveDeaths = false;
  let haveRoundsPlayed = false;
  let haveHeadshots = false;
  let haveDamage = false;

  for (const r of slice) {
    if (r.win === true || r.win === 1) wins++;

    const kills = pickNum(r, ["kills"]);
    if (kills !== null) {
      totKills += kills;
      haveKills = true;
    }
    const deaths = pickNum(r, ["deaths"]);
    if (deaths !== null) {
      totDeaths += deaths;
      haveDeaths = true;
    }
    // Rounds played: the direct field, falling back to the score sum (which the
    // harvester also relies on) if a payload ever omits it.
    let rp = pickNum(r, ["rounds_played"]);
    if (rp === null) {
      const ts = pickNum(r, ["team_score"]);
      const os = pickNum(r, ["opponent_team_score"]);
      if (ts !== null && os !== null) rp = ts + os;
    }
    if (rp !== null && rp > 0) {
      totRoundsPlayed += rp;
      haveRoundsPlayed = true;
    }
    const hs = pickNum(r, ["headshots"]);
    if (hs !== null) {
      totHeadshots += hs;
      haveHeadshots = true;
    }
    const dmg = pickNum(r, ["damage"]);
    if (dmg !== null) {
      totDamage += dmg;
      haveDamage = true;
    }
    if (typeof r.faceit_rating === "number") {
      ratingSum += r.faceit_rating;
      ratingCount++;
    }
  }

  const kd = haveKills && haveDeaths && totDeaths > 0 ? totKills / totDeaths : null;
  const kr =
    haveKills && haveRoundsPlayed && totRoundsPlayed > 0
      ? totKills / totRoundsPlayed
      : null;
  // ADR = total damage / total rounds played.
  const adr =
    haveDamage && haveRoundsPlayed && totRoundsPlayed > 0
      ? totDamage / totRoundsPlayed
      : null;
  const hs =
    haveHeadshots && haveKills && totKills > 0
      ? (totHeadshots / totKills) * 100
      : null;

  return {
    win: (wins / n) * 100,
    kills: haveKills ? totKills / n : null,
    kd,
    kr,
    adr,
    hs,
    rating: ratingCount > 0 ? ratingSum / ratingCount : null,
    matches: n,
  };
}

// ============================================================================
// FACEIT "time" stats endpoint — the fast first wave.
//
// `stats/v1/stats/time/users/{id}/games/cs2?page&size&game_mode` returns a flat
// array of per-match objects (newest first) on a SEPARATE rate-limit bucket from
// match-rounds, so it loads near-instantly even while match-rounds is in 429
// backoff. It carries everything the player card + Veto Helper need EXCEPT the
// FACEIT rating (there is no per-match faceit_rating here). So we fetch it first
// to paint almost all the data immediately, and let match-rounds fill the real
// rating in behind it. Field mapping (all values are STRINGS):
//   i1 = map (class_name), i10 = win 1/0, i6 = kills, i9 = MVP rounds,
//   c2 = K/D, c3 = K/R, c10 = ADR, c4 = HS%, date = ms timestamp.
// ============================================================================

const TIME_STATS_SIZE = 90; // per-map depth; one page, one request per player

export async function fetchTimeStats(
  playerId,
  size = TIME_STATS_SIZE,
  signal,
  priority = "high",
) {
  const res = await fetchWithRetry(
    `${faceitAPI}/stats/v1/stats/time/users/${playerId}/games/cs2?${new URLSearchParams(
      { page: "0", size: String(size), game_mode: "5v5" },
    )}`,
    // Its own endpoint bucket + the parallel lane: wave 1 for the whole roster
    // fires concurrently and never shares a cooldown with match-rounds.
    { signal, priority, bucket: "time", serialize: false },
  );
  const data = await res.json();
  // Endpoint returns a bare array (some deployments wrap it — tolerate both).
  return Array.isArray(data) ? data : (data.payload ?? data.items ?? []);
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// While the real FACEIT rating (from match-rounds) is still loading, estimate it
// from the time endpoint's per-match stats. FACEIT rating tracks per-round output
// almost perfectly, and empirically a linear fit on ADR predicts it to within
// ~0.05 across a real lobby (regression over the ten cards in a live matchroom).
// This replaces the old (avgKD + avgKR)/1.5, which — having NO intercept — was
// far too steep and badly overestimated high fraggers (e.g. 1.6 vs a real 1.28).
// Output is on the same ~1.0 faceit_rating scale, so it slots straight into
// calculatePlayerWinrate / the rating colour ramp and is simply replaced when the
// real value arrives.
export function estimateRating(avgAdr) {
  return 0.0063 * avgAdr + 0.65;
}

// Per-map { map: [estRating, winRate, count] } from time entries — SAME shape as
// computeMapStats, so computePlayerWinrate etc. consume it unchanged. `rating` is
// the estimate above (per map); match-rounds swaps in the real value in wave 2.
export function computeMapStatsFromTime(entries) {
  const acc = {};
  for (const e of entries || []) {
    const map = e.i1;
    if (!map) continue;
    const adr = num(e.c10);
    const win = num(e.i10);
    if (adr === null || win === null) continue;
    if (!acc[map]) acc[map] = { adr: 0, wins: 0, count: 0 };
    const a = acc[map];
    a.adr += adr;
    a.wins += win ? 1 : 0;
    a.count++;
  }
  const out = {};
  for (const map in acc) {
    const a = acc[map];
    out[map] = [
      estimateRating(a.adr / a.count),
      (a.wins / a.count) * 100,
      a.count,
    ]; // 0: (estimated) Rating, 1: Winrate, 2: No of matches
  }
  return out;
}

// Last-N (default 30) card band from time entries — everything but the real
// rating. FACEIT shows these "average" stats as the mean of per-match values, so
// we average the endpoint's own c-values (rather than pooling raw components,
// which also sidesteps the i7/i8 assists-vs-deaths ambiguity). `rating` is the
// estimate and `ratingEstimated` flags it for the pulsing "still loading" state;
// match-rounds replaces both in wave 2.
export function computeCardStatsFromTime(entries, window = 30) {
  if (!entries || entries.length === 0) return null;
  const sorted = [...entries].sort((a, b) => (num(b.date) ?? 0) - (num(a.date) ?? 0));
  const slice = sorted.slice(0, window);
  const n = slice.length;
  if (n === 0) return null;

  const mean = (key) => {
    let sum = 0;
    let count = 0;
    for (const e of slice) {
      const v = num(e[key]);
      if (v !== null) {
        sum += v;
        count++;
      }
    }
    return count > 0 ? sum / count : null;
  };

  let wins = 0;
  for (const e of slice) if (num(e.i10)) wins++;

  const adr = mean("c10");
  const rating = adr !== null ? estimateRating(adr) : null;

  return {
    win: (wins / n) * 100,
    kills: mean("i6"),
    kd: mean("c2"),
    kr: mean("c3"),
    adr,
    hs: mean("c4"),
    rating,
    ratingEstimated: rating !== null,
    matches: n,
  };
}

export function calculatePlayerWinrate(rating, winRate, noOfMatches) {
  const matchNoBonusCap = 20; // Number of matches after which all player will be equal to in terms of the bonus they get from the number of recent matches.
  const scale = 0.7 / (matchNoBonusCap / 90); // This will need changing if we suddenly can't pull 90 matches for whatever reason

  const recencyScore = Math.min(
    Math.log(noOfMatches + 1),
    Math.log(matchNoBonusCap + 1),
  );
  const mapWeight = Math.max(
    Math.min((noOfMatches / matchNoBonusCap) * scale, 0.7),
    0.1,
  );
  const rawMapScore = rating * (1 - mapWeight) + winRate * mapWeight;
  return Math.floor(rawMapScore * recencyScore);
}
