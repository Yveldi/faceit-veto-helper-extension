import { useEffect, useMemo, useState } from "react";
import {
  defaultMapPool,
  defaultMapThumbnail,
  faceitAPI,
  fetchWithRetry,
  getPlayerStats,
} from "../utils";
import { computePlayerWinrate } from "../stats";

// --- small fetch helpers (all through fetchWithRetry — the rate limiter) ----

async function fetchMatchPayload(matchId, signal) {
  const res = await fetchWithRetry(`${faceitAPI}/match/v2/match/${matchId}`, {
    signal,
  });
  return (await res.json()).payload;
}

// Fetch by player id (stable across nickname changes); the roster gives ids.
async function fetchPlayerProfile(playerId, signal) {
  const res = await fetchWithRetry(`${faceitAPI}/users/v1/users/${playerId}`, {
    signal,
  });
  return (await res.json()).payload;
}

// --- pure helpers -----------------------------------------------------------

// The lobby's map pool lives in payload.maps and/or matchCustom.tree; we take
// whichever lists more maps as the available pool. Pool + thumbnails MUST come
// from the same source or maps get undefined thumbnails — returned as a pair.
//
// `regretAlways` forces the full default pool regardless of how many maps are
// bannable. Otherwise: with 2+ maps we show that available (bannable) pool; with
// exactly ONE map (common in Premium queues — nothing to ban) `regretSingleMap`
// decides — off (default) shows just that map, on shows the full default pool so
// you can see your win probability on maps you can't play. Zero maps → default.
function resolveMapPool(mapData, regretSingleMap, regretAlways) {
  const fromMaps = mapData?.fromMaps ?? [];
  const fromTree = mapData?.fromTree ?? [];
  const candidates = fromTree.length >= fromMaps.length ? fromTree : fromMaps;

  const showAvailable =
    !regretAlways &&
    (candidates.length >= 2 ||
      (candidates.length === 1 && !regretSingleMap));
  if (showAvailable) {
    return {
      mapPool: candidates.map((m) => m.class_name),
      thumbnails: Object.fromEntries(
        candidates.map((m) => [m.class_name, m.image_sm]),
      ),
    };
  }
  return { mapPool: defaultMapPool, thumbnails: { ...defaultMapThumbnail } };
}

// Index of the team containing the logged-in user, else 0. The roster is
// enriched here, so the player id lives at player.profile.id.
function findMainTeamIndex(teams, selfUserId) {
  if (!selfUserId) return 0;
  const index = teams.findIndex((team) =>
    team.roster.some((player) => player.profile.id === selfUserId),
  );
  return index === -1 ? 0 : index;
}

// Enrich one roster: profile + per-map score + raw stats (kept for hovers).
async function enrichRoster(roster, signal) {
  const enriched = [];
  for (const player of roster) {
    const profile = await fetchPlayerProfile(player.id, signal);
    if (!profile?.id) continue;
    const stats = await getPlayerStats(profile, 90, signal);
    enriched.push({ profile, winrate: computePlayerWinrate(stats), stats });
  }
  return enriched;
}

// --- hook -------------------------------------------------------------------

// Loads everything Stage 2/3 needs for a match. `teams` is null while loading.
// The map pool is derived reactively from the fetched data + the Regret Helper
// flags, so toggling them re-resolves the pool without refetching anything.
export default function useMatchData(
  matchId,
  selfUserId,
  regretSingleMap,
  regretAlways,
) {
  const [teams, setTeams] = useState(null);
  const [mapData, setMapData] = useState(null);

  useEffect(() => {
    // Drop stale data right away (the old match must not show over the new one).
    setTeams(null);
    setMapData(null);
    if (!matchId) return;

    const controller = new AbortController();
    const { signal } = controller;

    (async () => {
      try {
        const payload = await fetchMatchPayload(matchId, signal);
        const sources = {
          fromMaps: payload.maps ?? [],
          fromTree: payload.matchCustom?.tree?.map?.values?.value ?? [],
        };

        const enrichedTeams = [];
        for (const team of Object.values(payload.teams)) {
          enrichedTeams.push({
            name: team.name,
            avatar: team.avatar,
            roster: await enrichRoster(team.roster, signal),
          });
        }

        if (signal.aborted) return;
        setMapData(sources);
        setTeams(enrichedTeams);
      } catch (err) {
        if (!signal.aborted) {
          console.error("Faceit Veto Helper: failed to load match data", err);
        }
      }
    })();

    // Aborts the in-flight fetch and frees the rate-limit queue of its requests.
    return () => controller.abort();
  }, [matchId]);

  const { mapPool, mapThumbnails } = useMemo(() => {
    const { mapPool, thumbnails } = resolveMapPool(
      mapData,
      regretSingleMap,
      regretAlways,
    );
    return { mapPool, mapThumbnails: thumbnails };
  }, [mapData, regretSingleMap, regretAlways]);

  const mainTeamIndex = useMemo(
    () => (teams ? findMainTeamIndex(teams, selfUserId) : 0),
    [teams, selfUserId],
  );

  return { teams, mapPool, mapThumbnails, mainTeamIndex, loading: !teams };
}
