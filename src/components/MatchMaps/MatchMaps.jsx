import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import RenderMap from "../RenderMap/RenderMap";
import "./MatchMaps.css";

const DEFAULT_TOP = 80;

// Presentational: the match-found detection lives in useMatchFoundMaps (lifted
// to App so AutoAccept can share it). This just anchors and renders the cards.
export default function MatchMaps({ dialog, roomMatchId, matchId, maps }) {
  const [anchorTop, setAnchorTop] = useState(DEFAULT_TOP);

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
