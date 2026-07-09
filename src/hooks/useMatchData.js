import { useEffect, useMemo, useState } from "react";
import {
  beginHighPriority,
  computeCardStats,
  computeMapStats,
  defaultMapPool,
  defaultMapThumbnail,
  endHighPriority,
  faceitAPI,
  fetchMatchRounds,
  fetchWithRetry,
} from "../utils";
import { computePlayerWinrate } from "../stats";

// In a single-map / no-veto lobby the decided map lands in the payload a moment
// AFTER the room opens (FACEIT only populates it past the accept step), and there
// is no veto panel for useVetoProgress to observe (no bannable rows). Since
// match/v2 is fetched only once per match, playedMap would otherwise stay null
// until a manual refresh. So when the map isn't decided yet AND the pool isn't a
// real multi-map veto (which useVetoProgress narrows live), re-fetch the payload a
// few times until the decided map appears.
const PLAYED_MAP_REFETCH_MAX = 6;
const PLAYED_MAP_REFETCH_MS = 2000;

// --- small fetch helpers (all through fetchWithRetry — the rate limiter) ----

async function fetchMatchPayload(matchId, signal) {
  const res = await fetchWithRetry(`${faceitAPI}/match/v2/match/${matchId}`, {
    signal,
  });
  return (await res.json()).payload;
}

function payloadSources(payload) {
  return {
    fromMaps: payload.maps ?? [],
    fromTree: payload.matchCustom?.tree?.map?.values?.value ?? [],
    // The map(s) the veto has settled on. For a BO1 this is the single decided
    // map once the veto finishes (empty while it's still ongoing).
    pick: payload.voting?.map?.pick ?? [],
  };
}

// Whether the decided map is already knowable from the payload (mirrors the
// `playedMap` derivation below).
function playedMapResolved(sources) {
  return (sources.pick?.length ?? 0) === 1 || (sources.fromMaps?.length ?? 0) === 1;
}

// A real multi-map veto: more than one bannable candidate, so the played map is
// decided by the live veto (useVetoProgress), not by re-fetching the payload.
function isMultiMapVeto(sources) {
  const candidates =
    (sources.fromTree?.length ?? 0) >= (sources.fromMaps?.length ?? 0)
      ? sources.fromTree
      : sources.fromMaps;
  return (candidates?.length ?? 0) >= 2;
}

// Wait, honoring the abort signal so navigating away cancels promptly.
function delay(ms, signal) {
  return new Promise((resolve) => {
    const id = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(id);
      resolve();
    });
  });
}

// --- pure helpers -----------------------------------------------------------

// Build the player `profile` we pass downstream straight from the match payload's
// roster entry. The match/v2 response ALREADY carries each player's `elo` and
// nickname inline (it's what FACEIT renders the room from), so we don't fetch
// `users/v1/users/{id}` per player at all — that was 10 redundant requests per
// match. Only `id`, `nickname`, and `games.cs2.faceit_elo` are consumed (see
// stats.js / PlayerMatrix); `elo` falls back to 0 if a payload ever omits it
// (same effect the old failed-profile path had: zero elo weight).
function rosterProfile(rosterEntry) {
  return {
    id: rosterEntry.id,
    nickname: rosterEntry.nickname,
    games: { cs2: { faceit_elo: rosterEntry.elo ?? 0 } },
    // Extra inline fields the player card renders — all already in the match
    // payload's roster, so no extra request. `elo` above is what stats use;
    // these are purely for the card (avatar, ESEA star, level/rank, party
    // grouping). Party id probes a few candidate keys because the field name
    // isn't documented; grouping just needs a stable per-party token.
    avatar: rosterEntry.avatar ?? null,
    memberships: Array.isArray(rosterEntry.memberships)
      ? rosterEntry.memberships
      : [],
    skillLevel: rosterEntry.gameSkillLevel ?? rosterEntry.skillLevel ?? null,
    partyId:
      rosterEntry.partyId ??
      rosterEntry.activeGroup ??
      rosterEntry.premadeId ??
      (rosterEntry.premade ? rosterEntry.premade : null) ??
      null,
  };
}

// The lobby's map pool lives in payload.maps and/or matchCustom.tree; we take
// whichever lists more maps as the available pool. We prefer our bundled
// high-quality thumbnail (keyed by class_name, same as mapPool.json `id`) and
// only fall back to the match payload's low-res `image_sm` for maps we don't
// ship, so the available pool looks identical to the default full pool.
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
        candidates.map((m) => [
          m.class_name,
          defaultMapThumbnail[m.class_name] ?? m.image_sm,
        ]),
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

// A roster entry before its per-map stats have loaded. Nickname AND elo are
// already known from the match payload (so the matrix can show elo immediately);
// only `winrate`/`stats` are empty until the stats fetch fills them in, which is
// what `loaded` gates.
function skeletonPlayer(rosterEntry) {
  return {
    profile: rosterProfile(rosterEntry),
    winrate: {},
    stats: {},
    // Last-30 aggregate for the player card's stats band; null until streamed.
    card: null,
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
// `loadStats` (default true) gates the per-player streaming fetch. When false
// (e.g. only the player-card replacement is on and its stats band is hidden),
// we still fetch match/v2 for the roster/pool but skip the ~10 per-player
// requests entirely — cards render instantly from the inline elo/nickname and
// nothing needs the streamed stats.
export default function useMatchData(
  matchId,
  selfUserId,
  regretSingleMap,
  regretAlways,
  loadStats = true,
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

    // Mark this whole load region high-priority so the player-tracking
    // harvester (low priority) always yields the rate-limit queue to it.
    beginHighPriority();

    (async () => {
      try {
        const payload = await fetchMatchPayload(matchId, signal);
        if (signal.aborted) return;

        let sources = payloadSources(payload);
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

        // Phase "streaming": fetch each player's match-rounds in place, one at
        // a time (the only per-player request left — the profile/elo already
        // came inline with the match payload). A single fetch feeds BOTH the
        // per-map stats (Veto Helper) and the last-30 card aggregate (player
        // card), so the card never costs an extra request. The rate limiter
        // paces these; each arrival re-renders the UI.
        //
        // Skipped entirely when nothing needs stats (loadStats=false): cards
        // still render from the roster we already set above.
        if (loadStats) {
          for (let ti = 0; ti < rawTeams.length; ti++) {
            const roster = rawTeams[ti].roster;
            for (let pi = 0; pi < roster.length; pi++) {
              if (signal.aborted) return;
              const profile = rosterProfile(roster[pi]);
              const rounds = await fetchMatchRounds(profile, 90, signal);
              if (signal.aborted) return;
              const stats = computeMapStats(rounds);
              const card = computeCardStats(rounds, 30);

              setTeams((prev) => {
                if (!prev) return prev;
                const next = prev.map((t) => ({ ...t, roster: [...t.roster] }));
                next[ti].roster[pi] = {
                  profile,
                  winrate: computePlayerWinrate(stats),
                  stats,
                  card,
                  loaded: true,
                };
                return next;
              });
              setLoadedCount((c) => c + 1);
            }
          }
        }

        // Catch a late-resolving played map (single-map / no-veto lobbies — see
        // the note by PLAYED_MAP_REFETCH_MAX). Skipped for real multi-map vetos,
        // which useVetoProgress narrows live from the DOM.
        for (
          let attempt = 0;
          attempt < PLAYED_MAP_REFETCH_MAX &&
          !signal.aborted &&
          !playedMapResolved(sources) &&
          !isMultiMapVeto(sources);
          attempt++
        ) {
          await delay(PLAYED_MAP_REFETCH_MS, signal);
          if (signal.aborted) return;
          const next = await fetchMatchPayload(matchId, signal);
          if (signal.aborted) return;
          sources = payloadSources(next);
          setMapData(sources);
        }
      } catch (err) {
        if (!signal.aborted) {
          console.error("Faceit Veto Helper: failed to load match data", err);
        }
      } finally {
        // Always release the priority lane, even on early `return` (abort) or
        // error, so the harvester isn't blocked forever.
        endHighPriority();
      }
    })();

    // Aborts the in-flight fetch and frees the rate-limit queue of its requests.
    return () => controller.abort();
  }, [matchId, loadStats]);

  const { mapPool, mapThumbnails } = useMemo(() => {
    const { mapPool, thumbnails } = resolveMapPool(
      mapData,
      regretSingleMap,
      regretAlways,
    );
    return { mapPool, mapThumbnails: thumbnails };
  }, [mapData, regretSingleMap, regretAlways]);

  // The map the match has settled on, once it's been determined — surfaced so the
  // displayed pool can highlight the card for the map actually being played
  // (regardless of pool size or the Regret Helper). Prefer the veto's explicit
  // pick; fall back to `payload.maps` once it lists a single map. Null while the
  // veto is still ongoing (no map decided yet).
  const playedMap = useMemo(() => {
    const pick = mapData?.pick ?? [];
    if (pick.length === 1) return pick[0];
    const fromMaps = mapData?.fromMaps ?? [];
    return fromMaps.length === 1 ? fromMaps[0].class_name : null;
  }, [mapData]);

  const mainTeamIndex = useMemo(
    () => (teams ? findMainTeamIndex(teams, selfUserId) : 0),
    [teams, selfUserId],
  );

  const totalCount = useMemo(
    () => (teams ? teams.reduce((s, t) => s + t.roster.length, 0) : 0),
    [teams],
  );

  // When we're not streaming stats, the roster (nicknames + elo) IS the whole
  // load, so jump straight to "loaded" once the map data is in.
  const phase = !mapData
    ? "init"
    : !loadStats
      ? "loaded"
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
    playedMap,
    mainTeamIndex,
    phase,
    loadedCount,
    totalCount,
    ready,
  };
}
