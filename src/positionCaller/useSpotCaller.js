import { useEffect, useRef } from "react";
import { faceitAPI, fetchWithRetry, sleep } from "../utils";
import {
  loadSpotCalls,
  getSpotFiredMatch,
  markSpotFired,
} from "../settings";
import { partySize, resolveCall } from "./spotLogic";
import {
  observeVetoEnd,
  selfHasMessagedTeamChat,
  sendTeamChat,
} from "./teamChat";

// The Position Caller detection + send controller (side-effect only, renders
// nothing). Decides once per match whether and when to auto-send the map call to
// Team chat, using ONLY the data the extension already has (no new page-load
// requests; Branch 2 makes at most one targeted re-fetch at veto end).
//
// Gate: the feature is enabled, we're in a matchroom, and the match is
// MATCHMAKING (payload.entity.type === "matchmaking"). Championships / 5-stack
// custom lobbies never trigger it — calling positions to your friends would be
// embarrassing.
//
// Fires at whichever moment the map becomes known (the map is decided at most
// once per match, so exactly one of these applies — there's no user choice
// between them):
//   Branch 1 (map already known at load): state === "VOTING" + a resolved
//     playedMap (the single-map / server-only-veto case). Fire immediately,
//     unless the user already posted in team chat (they beat us to it).
//   Branch 2 (map decided after we loaded): we loaded mid multi-map veto (state
//     === "VOTING", no map yet). Watch the live veto panel; when it concludes,
//     re-fetch match/v2 once for the decided map, then fire.
// Any other load state (SUBSTITUTION/CONFIGURING/READY/ONGOING/FINISHED, i.e. the
// veto already ended before we loaded, or the match started) never fires — the
// whole point is being first, so a late call is worse than none.
//
// Cross-tab / cross-reload dedup (FACEIT force-loads the same room into every
// open tab): a per-match persisted flag, plus a BroadcastChannel claim with a
// small random jitter so two tabs firing at the same instant don't double-send,
// plus (for Branch 1) the team-chat self-message check which also stands a tab
// down once a peer's message lands.

// Fired match ids for THIS tab's lifetime (dedups remounts + peer broadcasts).
const firedLocal = new Set();

const bc =
  typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel("fvh-spot")
    : null;
bc?.addEventListener?.("message", (e) => {
  if (e?.data?.matchId) firedLocal.add(e.data.matchId);
});

// Claim the right to send for `matchId`. Returns false if any peer/reload already
// has. The jitter lets one tab's broadcast + persisted flag land before the other
// finishes claiming, so the near-simultaneous double-load resolves to one send.
async function claimSend(matchId) {
  if (firedLocal.has(matchId)) return false;
  if ((await getSpotFiredMatch()) === matchId) return false;
  await sleep(Math.random() * 0.2);
  if (firedLocal.has(matchId)) return false;
  firedLocal.add(matchId);
  markSpotFired(matchId);
  bc?.postMessage({ matchId });
  return true;
}

// Re-fetch match/v2 once (Branch 2) for the decided map after the veto concludes.
async function refetchPlayedMap(matchId) {
  try {
    const res = await fetchWithRetry(`${faceitAPI}/match/v2/match/${matchId}`);
    const p = (await res.json()).payload;
    const pick = p.voting?.map?.pick ?? [];
    if (pick.length === 1) return pick[0];
    const maps = p.maps ?? [];
    if (maps.length === 1) return maps[0].class_name;
    return null;
  } catch {
    return null;
  }
}

export default function useSpotCaller(matchId, data, selfUserId, settings) {
  const { spotEnabled, spotDuo } = settings;
  const entityType = data?.entityType ?? null;
  const matchState = data?.matchState ?? null;
  const playedMap = data?.playedMap ?? null;

  // Latest render values the async fire path reads (kept out of effect deps so
  // per-player streaming updates don't re-run the evaluator).
  const latest = useRef({});
  latest.current = {
    teams: data?.teams,
    mainTeamIndex: data?.mainTeamIndex ?? 0,
    selfUserId,
    spotDuo,
  };

  const doneRef = useRef(false); // terminal for this match (fired or decided not to)
  const decidedRef = useRef(false); // branch chosen (once)
  const disconnectRef = useRef(null); // Branch 2 observer cleanup

  // Reset per-match, and tear down any Branch-2 observer on match change.
  useEffect(() => {
    doneRef.current = false;
    decidedRef.current = false;
    return () => {
      disconnectRef.current?.();
      disconnectRef.current = null;
    };
  }, [matchId]);

  useEffect(() => {
    if (doneRef.current || decidedRef.current) return;
    if (!spotEnabled || !matchId) return;
    // Wait for the match payload facts to load.
    if (entityType == null || matchState == null) return;
    // Only matchmaking.
    if (entityType !== "matchmaking") {
      doneRef.current = true;
      return;
    }

    decidedRef.current = true;

    const fireNow = async (mapId, isLobbyTrigger) => {
      if (doneRef.current) return;
      const { teams, mainTeamIndex, selfUserId, spotDuo } = latest.current;
      // Branch 1 only: stand down if the user already posted in team chat.
      if (isLobbyTrigger) {
        const selfNick = teams?.[mainTeamIndex]?.roster?.find(
          (p) => p.profile?.id === selfUserId,
        )?.profile?.nickname;
        if (selfHasMessagedTeamChat(selfNick)) {
          doneRef.current = true;
          return;
        }
      }
      const calls = await loadSpotCalls();
      const size = partySize(teams, mainTeamIndex, selfUserId);
      const msg = resolveCall(calls, mapId, size, spotDuo);
      if (!msg) {
        doneRef.current = true; // off map / empty call / 4-5 stack
        return;
      }
      if (!(await claimSend(matchId))) {
        doneRef.current = true; // a peer/reload already called
        return;
      }
      doneRef.current = true;
      sendTeamChat(msg);
    };

    if (matchState !== "VOTING") {
      // Veto already over / match started before we loaded → never fire.
      doneRef.current = true;
      return;
    }

    if (playedMap) {
      // Branch 1: map already known while the veto window is live.
      fireNow(playedMap, true);
      return;
    }

    // Branch 2: loaded mid multi-map veto (no map yet) — fire when it concludes.
    disconnectRef.current = observeVetoEnd(async () => {
      const mapId = playedMap || (await refetchPlayedMap(matchId));
      if (mapId) fireNow(mapId, false);
      else doneRef.current = true;
    });
  }, [matchId, entityType, matchState, playedMap, spotEnabled, selfUserId]);
}
