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
const MIN_GAP_MS = 400;
const RATE_LIMIT_COOLDOWN_MS = 10_000;

// Cross-tab rate-limit coordination. FACEIT applies its limit per account, not
// per tab, so two open faceit.com tabs each running their own 400ms queue would
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

// Up to this much extra is added on top of MIN_GAP_MS per slot so our requests
// don't fire on a perfectly periodic 400ms beat. A fixed cadence can stay phase-
// locked with the page's own polling or another extension's, re-colliding every
// cycle; the jitter spreads our calls across the gaps between theirs.
const GAP_JITTER_MS = 150;

// --- congestion gate --------------------------------------------------------
//
// The 429s we actually see don't come from OUR pace (the queue above already
// keeps us slow). They come from the page itself: on load — and again whenever
// it refreshes a section — faceit.com fires a storm of its own /api calls, and
// the rate limit is account-wide, so the budget is gone before our first stats
// request even leaves. Retrying faster just dives back into the same storm.
//
// So before releasing a slot we watch the PAGE's API traffic (via Resource
// Timing) and hold our request while that traffic is heavy, slipping in only
// once it quiets. This is adaptive: it covers the initial load storm AND the
// later mid-session bursts, without a blanket startup delay that would slow the
// common quiet case. A hard cap guarantees we never wait forever (the page
// polls some endpoints indefinitely, so "perfectly idle" may never arrive).
const ACTIVITY_WINDOW_MS = 1000; // look back this far when judging "busy"
const BUSY_THRESHOLD = 6; // > this many page API calls in the window = storm
const CONGESTION_POLL_MS = 200; // re-check cadence while waiting it out
const MAX_CONGESTION_WAIT_MS = 2500; // never defer a single request beyond this

// Only the LEADING EDGE of a burst probes congestion. faceit.com's SPA polls
// its own /api endpoints continuously while the tab is focused, so the page is
// almost never "quiet" — gating every request on that would hold each one to the
// cap and effectively stall the overlay (it only recovered when the popup blurred
// the page and faceit paused its polling). Our queue already spaces requests
// ~400ms apart, so once we've waited out the initial load storm we stream freely:
// we re-probe congestion only when this request follows an idle gap (a fresh
// burst), not for the back-to-back requests of a single match load.
const FRESH_BURST_IDLE_MS = 1500;
let lastSlotAt = 0;

// responseEnd timestamps (performance.now clock) of recent same-origin API
// requests the PAGE made — our own fetches land here too, but we're serialized
// to one in flight so they barely move the count against BUSY_THRESHOLD.
const recentApiActivity = [];
let apiActivityObserver = null;

function nowMs() {
  return typeof performance !== "undefined" && performance.now
    ? performance.now()
    : Date.now();
}

function trimActivity() {
  const cutoff = nowMs() - ACTIVITY_WINDOW_MS;
  while (recentApiActivity.length && recentApiActivity[0] < cutoff) {
    recentApiActivity.shift();
  }
}

function startApiActivityMonitor() {
  if (apiActivityObserver || typeof PerformanceObserver === "undefined") return;
  try {
    apiActivityObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        // Only count fetch/XHR to the FACEIT API — images, fonts and CDN assets
        // don't consume the API rate budget, so they shouldn't gate us.
        if (
          (entry.initiatorType === "fetch" ||
            entry.initiatorType === "xmlhttprequest") &&
          entry.name.includes("/api/")
        ) {
          recentApiActivity.push(entry.responseEnd || entry.startTime);
        }
      }
      trimActivity();
    });
    // `buffered: true` replays entries from before we subscribed, so we already
    // see the load storm that began the instant the page started.
    apiActivityObserver.observe({ type: "resource", buffered: true });
  } catch {
    apiActivityObserver = null;
  }
}

function pageApiCallsInWindow() {
  trimActivity();
  return recentApiActivity.length;
}

// Block until the page's API traffic drops below the storm threshold, or the cap
// elapses. Honors the abort signal so navigating away doesn't strand us here.
async function waitForApiQuiet(signal) {
  startApiActivityMonitor();
  const start = nowMs();
  while (pageApiCallsInWindow() > BUSY_THRESHOLD) {
    if (signal?.aborted) return;
    if (nowMs() - start >= MAX_CONGESTION_WAIT_MS) return;
    await sleep(CONGESTION_POLL_MS / 1000);
  }
}

async function acquireFetchSlot(signal) {
  const myTurn = queueChain.then(async () => {
    while (Date.now() < earliestNextFetch) {
      const waitMs = earliestNextFetch - Date.now();
      await sleep(waitMs / 1000);
    }
    // Hold the slot open until the page isn't mid-storm — but ONLY on the
    // leading edge of a burst (this request follows an idle gap). Mid-load,
    // back-to-back requests skip the probe so a continuously-polling page can't
    // stall the whole load. Done INSIDE the queue so only one request probes at
    // a time and the others stay serialized behind it.
    if (Date.now() - lastSlotAt > FRESH_BURST_IDLE_MS) {
      await waitForApiQuiet(signal);
    }
    lastSlotAt = Date.now();
    reserveSlot(Date.now() + MIN_GAP_MS + Math.random() * GAP_JITTER_MS);
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

// FACEIT's stats limiter is a sliding window and announces its policy on every
// response: `ratelimit-limit: 6, 6;w=20` means 6 requests per 20s window
// (observed on player-match-rounds). Our 400ms queue burns that budget in
// ~2.5s; after that a slot only frees as an old request ages out of the
// window — one every window/limit seconds (~3.3s here). Firing sooner probes
// for the slot with a wasted 429 (the 200/429/200/429 alternation); waiting
// for the full `ratelimit-reset` clears everything but stalls the load for the
// whole window. So we read the budget headers on EVERY response, 200s
// included: when one reports the window spent (`ratelimit-remaining: 0`), we
// push the shared cooldown clock forward by window/limit — the exact
// sustainable drip rate — so the remaining requests stream without a single
// failed probe. Burst-then-drip is optimal here: the first `limit` requests go
// at full queue speed, the rest at the drip.
const FALLBACK_SLOT_MS = 3500;
// The drip interval the limiter last taught us (policy header or a 429's
// ratelimit-retry-after), for responses that omit their own.
let lastSlotIntervalMs = null;

// Parse the IETF draft `ratelimit-limit` policy, e.g. "6, 6;w=20" → one slot
// per 20/6 s. Null when the policy/window isn't advertised.
function policySlotMs(headerValue) {
  const m = /(\d+)\s*;\s*w=(\d+)/.exec(headerValue ?? "");
  if (!m) return null;
  const limit = Number(m[1]);
  const windowSec = Number(m[2]);
  if (!(limit > 0) || !(windowSec > 0)) return null;
  return (windowSec * 1000) / limit;
}

function noteRateLimitBudget(response) {
  const headers = response.headers;
  const remaining = Number(headers.get("ratelimit-remaining"));
  if (!Number.isFinite(remaining) || remaining > 0) return;
  const slotMs =
    policySlotMs(headers.get("ratelimit-limit")) ??
    parseRetryAfter(headers.get("ratelimit-retry-after")) ??
    lastSlotIntervalMs ??
    FALLBACK_SLOT_MS;
  lastSlotIntervalMs = slotMs;
  reserveSlot(Date.now() + slotMs + RATE_LIMIT_HEADER_PAD_MS);
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
    noteRateLimitBudget(response);

    if (response.ok) return response;
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
      // wide, regardless of how transient it looked. Also remember it as the
      // slot interval, so noteRateLimitBudget can pace budget-exhausted 200s at
      // the same drip rate without needing another 429 to measure it.
      if (retryAfterMs !== null) {
        lastSlotIntervalMs = retryAfterMs;
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
