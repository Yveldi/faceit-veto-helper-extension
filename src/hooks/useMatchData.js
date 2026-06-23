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

// Index of the team containing the logged-in user, else 0.
function findMainTeamIndex(teams, selfUserId) {
  if (!selfUserId) return 0;
  const index = teams.findIndex((team) =>
    team.roster.some((player) => player.profile.id === selfUserId),
  );
  return index === -1 ? 0 : index;
}

// A roster entry before its profile/stats have loaded: nickname is known from
// the match payload, everything else is empty and `loaded` is false.
function skeletonPlayer(rosterEntry) {
  return {
    profile: { id: rosterEntry.id, nickname: rosterEntry.nickname },
    winrate: {},
    stats: {},
    loaded: false,
  };
}

// --- hook -------------------------------------------------------------------

// Loads everything Stage 2/3 need for a match, PROGRESSIVELY so the UI can show
// a multi-stage loading experience (see the design's four phases):
//   init      — nothing fetched yet (teams null, mapData null)
//   maps      — map pool + both rosters (nicknames) known, 0 players enriched
//   streaming — per-player elo + stats arrive one at a time (rate-limited)
//   loaded    — every player enriched
// `teams` is set to a skeleton (nicknames only) as soon as match/v2 returns,
// then each player is filled in place. `phase`/`loadedCount`/`totalCount`/`ready`
// drive the loading UI; `ready` (=== loaded) gates consumers that must not act on
// partial data (AutoVeto, the self-stats cache).
export default function useMatchData(
  matchId,
  selfUserId,
  regretSingleMap,
  regretAlways,
) {
  const [teams, setTeams] = useState(null);
  const [mapData, setMapData] = useState(null);
  const [loadedCount, setLoadedCount] = useState(0);

  useEffect(() => {
    // Drop stale data right away (the old match must not show over the new one).
    setTeams(null);
    setMapData(null);
    setLoadedCount(0);
    if (!matchId) return;

    const controller = new AbortController();
    const { signal } = controller;

    (async () => {
      try {
        const payload = await fetchMatchPayload(matchId, signal);
        if (signal.aborted) return;

        const sources = {
          fromMaps: payload.maps ?? [],
          fromTree: payload.matchCustom?.tree?.map?.values?.value ?? [],
        };
        const rawTeams = Object.values(payload.teams);

        // Phase "maps": reveal the pool + a nickname-only skeleton immediately.
        setMapData(sources);
        setTeams(
          rawTeams.map((team) => ({
            name: team.name,
            avatar: team.avatar,
            roster: team.roster.map(skeletonPlayer),
          })),
        );

        // Phase "streaming": enrich each player in place, one at a time. The
        // rate limiter already paces these; each arrival re-renders the UI.
        for (let ti = 0; ti < rawTeams.length; ti++) {
          const roster = rawTeams[ti].roster;
          for (let pi = 0; pi < roster.length; pi++) {
            if (signal.aborted) return;
            const profile = await fetchPlayerProfile(roster[pi].id, signal);
            const stats = profile?.id
              ? await getPlayerStats(profile, 90, signal)
              : {};
            if (signal.aborted) return;

            setTeams((prev) => {
              if (!prev) return prev;
              const next = prev.map((t) => ({ ...t, roster: [...t.roster] }));
              next[ti].roster[pi] = {
                profile: profile?.id ? profile : next[ti].roster[pi].profile,
                winrate: computePlayerWinrate(stats),
                stats,
                loaded: true,
              };
              return next;
            });
            setLoadedCount((c) => c + 1);
          }
        }
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

  const totalCount = useMemo(
    () => (teams ? teams.reduce((s, t) => s + t.roster.length, 0) : 0),
    [teams],
  );

  const phase = !mapData
    ? "init"
    : loadedCount === 0
      ? "maps"
      : loadedCount < totalCount
        ? "streaming"
        : "loaded";
  const ready = phase === "loaded";

  return {
    teams,
    mapPool,
    mapThumbnails,
    mainTeamIndex,
    phase,
    loadedCount,
    totalCount,
    ready,
  };
}
