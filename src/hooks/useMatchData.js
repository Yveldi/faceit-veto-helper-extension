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

// Map pool + thumbnails MUST come from the same source, or maps end up with
// undefined thumbnails. Always return them as a pair.
//
// payload.maps narrows to the *picked* map(s) once voting ends (e.g. a single
// map in a finished match), while matchCustom.tree keeps the full votable pool.
// So use whichever source lists more maps, and only fall back to the default
// pool when neither gives us 2+.
function resolveMapPool(payload) {
  const fromMaps = payload.maps ?? [];
  const fromTree = payload.matchCustom?.tree?.map?.values?.value ?? [];
  const candidates =
    fromTree.length >= fromMaps.length ? fromTree : fromMaps;

  if (candidates.length >= 2) {
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
  console.log("FVH: selfUserId =", selfUserId, "→ mainTeamIndex =", index);
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
// On a match change it clears immediately and aborts the previous load, so a
// stale match never lingers over a newly opened room.
export default function useMatchData(matchId, selfUserId) {
  const [teams, setTeams] = useState(null);
  const [mapPool, setMapPool] = useState(defaultMapPool);
  const [mapThumbnails, setMapThumbnails] = useState({ ...defaultMapThumbnail });

  useEffect(() => {
    // Drop stale data right away (the old match must not show over the new one).
    setTeams(null);
    setMapPool(defaultMapPool);
    setMapThumbnails({ ...defaultMapThumbnail });
    if (!matchId) return;

    const controller = new AbortController();
    const { signal } = controller;

    (async () => {
      try {
        const payload = await fetchMatchPayload(matchId, signal);
        const { mapPool: pool, thumbnails } = resolveMapPool(payload);

        const enrichedTeams = [];
        for (const team of Object.values(payload.teams)) {
          enrichedTeams.push({
            name: team.name,
            avatar: team.avatar,
            roster: await enrichRoster(team.roster, signal),
          });
        }

        if (signal.aborted) return;
        setMapPool(pool);
        setMapThumbnails(thumbnails);
        setTeams(enrichedTeams);
      } catch (err) {
        if (!signal.aborted) console.error("FVH: failed to load match data", err);
      }
    })();

    // Aborts the in-flight fetch and frees the rate-limit queue of its requests.
    return () => controller.abort();
  }, [matchId]);

  // Recomputed from loaded data — keeps a late-resolving selfUserId from
  // triggering a refetch.
  const mainTeamIndex = useMemo(
    () => (teams ? findMainTeamIndex(teams, selfUserId) : 0),
    [teams, selfUserId],
  );

  return { teams, mapPool, mapThumbnails, mainTeamIndex, loading: !teams };
}
