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

async function acquireFetchSlot() {
  const myTurn = queueChain.then(async () => {
    while (Date.now() < earliestNextFetch) {
      const waitMs = earliestNextFetch - Date.now();
      await sleep(waitMs / 1000);
    }
    reserveSlot(Date.now() + MIN_GAP_MS);
  });
  queueChain = myTurn.catch(() => {});
  await myTurn;
}

export async function fetchWithRetry(url, { signal } = {}) {
  const maxRetries = 10;
  const baseWaitTime = 4;
  const maxWaitTime = 20;
  const retryCodes = [429, 503, 502, 504];

  for (let i = 0; i < maxRetries; i++) {
    // Optional cancellation. Bail before taking a queue slot and again after,
    // so an aborted request never fires and frees the queue immediately. Timing
    // for normal (no-signal) callers is unchanged.
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    await acquireFetchSlot();
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const response = await fetch(url, { signal });

    if (response.ok) return response;
    if (response.status === 404) {
      return response;
    }
    if (!retryCodes.includes(response.status)) {
      throw new Error(`Request failed. Code: ${response.status}`);
    }
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("Retry-After"));
      const cooldownMs =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : RATE_LIMIT_COOLDOWN_MS;
      // Broadcast the cooldown so every other tab backs off too — a 429 is
      // account-wide, so all tabs must wait, not just the one that got it.
      reserveSlot(Date.now() + cooldownMs);
    }
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
