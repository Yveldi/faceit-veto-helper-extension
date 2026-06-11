import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import useMatchDetector from "../../hooks/useMatchDetector";
import { getSelfUserId, getCurrentMatchId, getMatchMaps } from "../../api";
import RenderMap from "../RenderMap/RenderMap";
import "./MatchMaps.css";

const DEFAULT_TOP = 80;

export default function MatchMaps() {
  const dialog = useMatchDetector();
  const [matchId, setMatchId] = useState(null);
  const [maps, setMaps] = useState(null);
  const [anchorTop, setAnchorTop] = useState(DEFAULT_TOP);

  // When a match dialog appears, resolve which match we're in. The match
  // shows up in groupByState early (during the SCHEDULED/accept phase).
  useEffect(() => {
    if (!dialog) return;
    let cancelled = false;
    (async () => {
      const userId = await getSelfUserId();
      console.log("FVH: userId =", userId);
      if (!userId) {
        console.log("FVH: could not determine user ID, aborting");
        return;
      }
      // No added delay: fetchWithRetry's global queue paces every request.
      for (let attempt = 0; attempt < 8 && !cancelled; attempt++) {
        const id = await getCurrentMatchId(userId);
        if (id) {
          console.log("FVH: matchId =", id);
          if (!cancelled) setMatchId(id);
          return;
        }
      }
      console.log("FVH: no match found in groupByState");
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
          console.log("FVH: maps =", matchMaps);
          setMaps(matchMaps);
          return;
        }
      }
      console.log("FVH: gave up finding maps");
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

  if (!maps) return null;

  return createPortal(
    <div className="matchMaps-root" style={{ top: anchorTop }}>
      {maps.map((map) => (
        <RenderMap key={map} map={map} />
      ))}
    </div>,
    document.body,
  );
}
