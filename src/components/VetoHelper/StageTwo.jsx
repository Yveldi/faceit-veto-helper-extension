import MapWinProbabilities from "../MapWinProbabilities/MapWinProbabilities";
import useHoverIntent from "../../hooks/useHoverIntent";

// Default stage body: per-map win-probability cards for the main team. Hovering
// a card (once loaded) reveals a side breakdown popover. During loading the
// cards stream in and settle; the loading status sits in the legend row.
export default function StageTwo({
  isDragging,
  data,
  summaries,
  winSummaries,
  phase,
  cardPhase,
  statusText,
}) {
  // Drag is header-only now, so the body never starts a drag: show instantly.
  const hover = useHoverIntent(isDragging, { showDelay: 0, dragCooldown: 0 });
  const { mapPool, mapThumbnails, mainTeamIndex, playedMap } = data;
  const otherIndex = mainTeamIndex === 0 ? 1 : 0;
  // Status reflects real load progress even while the cards still show placeholders.
  const bodyStatus = phase === "maps" || phase === "streaming" ? statusText : null;

  return (
    <MapWinProbabilities
      mainTeam={winSummaries?.[mainTeamIndex]}
      otherTeam={winSummaries?.[otherIndex]}
      breakdownMain={summaries?.[mainTeamIndex]}
      breakdownOther={summaries?.[otherIndex]}
      mapPool={mapPool}
      mapThumbnails={mapThumbnails}
      playedMap={playedMap}
      phase={cardPhase}
      breakdownPhase={phase}
      hover={hover}
      bodyStatus={bodyStatus}
      wide
    />
  );
}
