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

let queueChain = Promise.resolve();
let earliestNextFetch = 0;
const RATE_LIMIT_COOLDOWN_MS = 10_000;

// Cross-tab rate-limit coordination. FACEIT applies its limit per account, not
// per tab, so two open faceit.com tabs each running their own queue would
// fire at twice the safe rate. We share only the cooldown CLOCK between tabs
// (not the requests — those stay in each tab's content script so they keep the
// same-origin cookie auth): whenever any tab reserves a slot or hits a 429, it
// broadcasts its new `earliestNextFetch`, and every other tab pulls its own
// clock forward to match. Each tab still serializes its own queue locally; the
// shared floor just stops tabs from overlapping. BroadcastChannel is supported
// in every browser we target (Firefox 109+, Chrome) but guarded for safety.
const rateLimitChannel =
  typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel("fvh-rate-limit")
    : null;

// Pull our local clock forward to a floor another tab announced (or any newer
// reservation). Only ever moves the clock later, never earlier.
function bumpEarliestNextFetch(ts) {
  if (ts > earliestNextFetch) earliestNextFetch = ts;
}

rateLimitChannel?.addEventListener("message", (event) => {
  const ts = event.data?.earliestNextFetch;
  if (typeof ts === "number") bumpEarliestNextFetch(ts);
});

// Reserve the next slot locally AND tell other tabs about it, so their queues
// back off behind ours.
function reserveSlot(untilTs) {
  bumpEarliestNextFetch(untilTs);
  rateLimitChannel?.postMessage({ earliestNextFetch: earliestNextFetch });
}

// No proactive pacing: requests fire as fast as the serialized queue allows,
// with nothing held back at the start of a load. The only wait is the one the
// limiter itself forces on us after the fact — a 429's retry-after (see the
// 429 branch below), broadcast onto this shared clock. The queue still
// serializes to one request in flight so that wait, once discovered, holds
// back the requests behind it instead of them all piling into the same 429.
async function acquireFetchSlot(_signal) {
  const myTurn = queueChain.then(async () => {
    while (Date.now() < earliestNextFetch) {
      const waitMs = earliestNextFetch - Date.now();
      await sleep(waitMs / 1000);
    }
  });
  queueChain = myTurn.catch(() => {});
  await myTurn;
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

// After a request that DIDN'T 429, pace the queue off the headers it returned.
// When the limiter says no slots remain, hold the next fetch back by one drip
// interval so it lands on a refilled slot instead of a 429. When slots remain,
// do nothing — the queue is free to fire. Broadcast the floor so other tabs
// back off too (the limit is account-wide).
function paceFromResponse(response) {
  const info = parseRateLimit(response);
  if (info && info.remaining <= 0) {
    reserveSlot(Date.now() + info.dripMs);
  }
}

export async function fetchWithRetry(url, { signal } = {}) {
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
    await acquireFetchSlot(signal);
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const response = await fetch(url, { signal });

    if (response.ok) {
      // Pace the NEXT request off this success's headers: FACEIT reports
      // remaining=0 on the response that takes the last slot, so honour that
      // instead of firing straight into a guaranteed 429.
      paceFromResponse(response);
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
        reserveSlot(Date.now() + retryAfterMs);
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
      // limit. Now apply the heavy account-wide cooldown so all tabs back off.
      reserveSlot(Date.now() + RATE_LIMIT_COOLDOWN_MS);
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

export async function getPlayerStats(player, noOfMatches = 90, signal) {
  const maxMatchesPerFetch = 90;
  const winRate = {};
  const faceitRating = {};

  let timesToFetch = Math.ceil(noOfMatches / maxMatchesPerFetch);
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
        { signal },
      );
      const data = (await res.json()).payload;
      offsetToken = data.next_offset_token;

      data.cs2.match_rounds.forEach((match) => {
        if (typeof match.faceit_rating === "number") {
          if (!faceitRating[match.map]) {
            faceitRating[match.map] = [];
            winRate[match.map] = [];
          }
          faceitRating[match.map].push(match.faceit_rating);
          winRate[match.map].push(match.win ? 100 : 0);
        }
      });
    } catch (error) {
      // Let cancellation (a new match aborting this load) propagate quietly.
      if (error?.name === "AbortError") throw error;
      console.error(
        `Faceit Veto Helper: failed to fetch stats for ${player.nickname ?? player.id}`,
        error,
      );
    }
  }
  const finalFaceitRating = {};
  for (const map in faceitRating) {
    winRate[map] =
      winRate[map].reduce((acc, curr) => acc + curr, 0) / winRate[map].length;
    finalFaceitRating[map] = [
      faceitRating[map].reduce((acc, curr) => acc + curr, 0) /
        faceitRating[map].length,
      winRate[map],
      faceitRating[map].length,
    ];
  } // 0: Rating, 1: Winrate, 2: No of matches
  return finalFaceitRating;
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
