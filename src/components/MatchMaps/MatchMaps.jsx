import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import useMatchDetector from "../../hooks/useMatchDetector";
import useMatchIdFromUrl from "../../hooks/useMatchIdFromUrl";
import { getSelfUserId, getCurrentMatchId, getMatchMaps } from "../../api";
import RenderMap from "../RenderMap/RenderMap";
import "./MatchMaps.css";

const DEFAULT_TOP = 80;

export default function MatchMaps() {
  const dialog = useMatchDetector();
  const roomMatchId = useMatchIdFromUrl();
  const [matchId, setMatchId] = useState(null);
  const [maps, setMaps] = useState(null);
  const [anchorTop, setAnchorTop] = useState(DEFAULT_TOP);

  // Hide once we've navigated into THIS match's own room — accepting forces a
  // load of /room/{matchId}. We compare against the previewed matchId (not just
  // "any room"), so finding a match while viewing a *previous* matchroom still
  // shows the preview; it only clears when the new room actually loads.
  useEffect(() => {
    if (matchId && roomMatchId === matchId) {
      setMatchId(null);
      setMaps(null);
    }
  }, [roomMatchId, matchId]);

  // When a match dialog appears, resolve which match we're in. The match
  // shows up in groupByState early (during the SCHEDULED/accept phase).
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

  // Poll the maps endpoint once we know the match id. This is intentionally
  // decoupled from the dialog: the map pool isn't assigned until after the
  // ready-check (SCHEDULED) ends, by which point the accept dialog has closed.
  useEffect(() => {
    setMaps(null);
    if (!matchId) return;
    let cancelled = false;
    (async () => {
      // No added delay: fetchWithRetry's global queue paces every request.
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

  // Anchor under the dialog while it's open; otherwise sit near the top.
  useEffect(() => {
    if (!dialog) {
      setAnchorTop(DEFAULT_TOP);
      return;
    }
    const updateAnchor = () =>
      setAnchorTop(dialog.getBoundingClientRect().bottom + 12);
    updateAnchor();
    window.addEventListener("resize", updateAnchor);
    const resizeObserver = new ResizeObserver(updateAnchor);
    resizeObserver.observe(dialog);
    return () => {
      window.removeEventListener("resize", updateAnchor);
      resizeObserver.disconnect();
    };
  }, [dialog]);

  if (!maps || roomMatchId === matchId) return null;

  return createPortal(
    <div className="matchMaps-root" style={{ top: anchorTop }}>
      {maps.map((map) => (
        <RenderMap key={map} map={map} />
      ))}
    </div>,
    document.body,
  );
}
