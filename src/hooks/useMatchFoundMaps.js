import { useEffect, useState } from "react";
import useMatchDetector from "./useMatchDetector";
import useMatchIdFromUrl from "./useMatchIdFromUrl";
import { getSelfUserId, getCurrentMatchId, getMatchMaps } from "../api";

// Shared detection for the "match found" flow, used by both MatchMaps (preview)
// and AutoAccept (map-based cancel) so the map pool is resolved only once.
// Returns the open dialog, the previewed match id, the current room id, and the
// detected map pool (array) or null.
export default function useMatchFoundMaps() {
  const dialog = useMatchDetector();
  const roomMatchId = useMatchIdFromUrl();
  const [matchId, setMatchId] = useState(null);
  const [maps, setMaps] = useState(null);

  // Clear once we navigate into THIS match's own room (accepting forces a load
  // of /room/{matchId}). Compared against the previewed matchId, not "any room",
  // so finding a match while viewing a previous matchroom still detects it.
  useEffect(() => {
    if (matchId && roomMatchId === matchId) {
      setMatchId(null);
      setMaps(null);
    }
  }, [roomMatchId, matchId]);

  // When a match dialog appears, resolve which match we're in (it shows up in
  // groupByState early, during the SCHEDULED/accept phase).
  useEffect(() => {
    if (!dialog) return;
    let cancelled = false;
    (async () => {
      const userId = await getSelfUserId();
      if (!userId) return;
      // No added delay: fetchWithRetry's global queue paces every request.
      for (let attempt = 0; attempt < 8 && !cancelled; attempt++) {
        const id = await getCurrentMatchId(userId);
        if (id) {
          if (!cancelled) setMatchId(id);
          return;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dialog]);

  // Poll the maps endpoint once we know the match id. Decoupled from the dialog:
  // the pool isn't assigned until after the ready-check, by which point the
  // accept dialog may have closed.
  useEffect(() => {
    setMaps(null);
    if (!matchId) return;
    let cancelled = false;
    (async () => {
      for (let attempt = 0; attempt < 60 && !cancelled; attempt++) {
        const matchMaps = await getMatchMaps(matchId);
        if (cancelled) return;
        if (matchMaps?.length) {
          setMaps(matchMaps);
          return;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [matchId]);

  return { dialog, roomMatchId, matchId, maps };
}
