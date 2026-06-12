// Same-origin because the content script runs on faceit.com — no CORS, no proxy needed
export const faceitAPI = "https://www.faceit.com/api";

export const defaultMapPool = [
  "de_dust2",
  "de_mirage",
  "de_nuke",
  "de_ancient",
  "de_inferno",
  "de_overpass",
  "de_anubis",
  "de_cache",
];

export const defaultMapThumbnail = {};
defaultMapThumbnail["de_dust2"] =
  "https://assets.faceit-cdn.net/third_party/games/ce652bd4-0abb-4c90-9936-1133965ca38b/assets/votables/adf58ac6-b0f3-40e9-87ef-0af23fc60918_1695819116078.jpeg";
defaultMapThumbnail["de_mirage"] =
  "https://assets.faceit-cdn.net/third_party/games/ce652bd4-0abb-4c90-9936-1133965ca38b/assets/votables/796b5b23-41e4-4387-a4a9-0d28c1c57456_1695819136505.jpeg";
defaultMapThumbnail["de_nuke"] =
  "https://assets.faceit-cdn.net/third_party/games/ce652bd4-0abb-4c90-9936-1133965ca38b/assets/votables/15ff938d-a70d-4d0b-9bf9-6be215cdb193_1695819151395.jpeg";
defaultMapThumbnail["de_ancient"] =
  "https://assets.faceit-cdn.net/third_party/games/ce652bd4-0abb-4c90-9936-1133965ca38b/assets/votables/a7d193ca-9498-4546-bf7b-da33e3e429a5_1695819186093.jpeg";
defaultMapThumbnail["de_inferno"] =
  "https://assets.faceit-cdn.net/third_party/games/ce652bd4-0abb-4c90-9936-1133965ca38b/assets/votables/a2cb95be-1a3f-49f3-a5fa-a02503d02086_1695819214782.jpeg";
defaultMapThumbnail["de_overpass"] =
  "https://assets.faceit-cdn.net/third_party/games/ce652bd4-0abb-4c90-9936-1133965ca38b/assets/votables/6d7e8e7f-f136-49f3-a4ca-a9afffbe8022_1695819165013.jpeg";
defaultMapThumbnail["de_anubis"] =
  "https://assets.faceit-cdn.net/third_party/games/ce652bd4-0abb-4c90-9936-1133965ca38b/assets/votables/847a46ed-fbcc-4347-a64a-bc2d6a24be89_1695819226252.jpeg";
defaultMapThumbnail["de_cache"] =
  "https://assets.faceit-cdn.net/third_party/games/ce652bd4-0abb-4c90-9936-1133965ca38b/assets/votables/db483b30-8cbb-488f-8105-0b60c111cc9a_1741030130806.jpeg";

export function sleep(seconds) {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
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
let requestCounter = 0;
const MIN_GAP_MS = 400;
const RATE_LIMIT_COOLDOWN_MS = 10_000;
const debugStart = performance.now();
const tag = () =>
  `t+${(performance.now() - debugStart).toFixed(0).padStart(5)}ms`;

async function acquireFetchSlot(reqId, attempt) {
  const myTurn = queueChain.then(async () => {
    while (Date.now() < earliestNextFetch) {
      const waitMs = earliestNextFetch - Date.now();
      await sleep(waitMs / 1000);
    }
    earliestNextFetch = Date.now() + MIN_GAP_MS;
  });
  queueChain = myTurn.catch(() => {});
  await myTurn;
}

export async function fetchWithRetry(url, { signal } = {}) {
  const maxRetries = 10;
  const baseWaitTime = 4;
  const maxWaitTime = 20;
  const retryCodes = [429, 503, 502, 504];
  const reqId = ++requestCounter;
  const shortUrl = url.length > 50 ? `...${url.slice(-50)}` : url;

  for (let i = 0; i < maxRetries; i++) {
    // Optional cancellation. Bail before taking a queue slot and again after,
    // so an aborted request never fires and frees the queue immediately. Timing
    // for normal (no-signal) callers is unchanged.
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    await acquireFetchSlot(reqId, i);
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const fetchStart = performance.now();
    const response = await fetch(url, { signal });
    const fetchMs = (performance.now() - fetchStart).toFixed(0);

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
      earliestNextFetch = Math.max(earliestNextFetch, Date.now() + cooldownMs);
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
