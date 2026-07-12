import MatchOverview from "../MatchOverview/MatchOverview";

// Expanded stage body: win-probability cards next to a per-player map matrix.
// Both stream in during loading (cards settle, matrix fills row by row).
export default function StageThree({
  data,
  summaries,
  winSummaries,
  phase,
  cardPhase,
  selfUserId,
  isDragging,
}) {
  const { mapPool, mapThumbnails, mainTeamIndex, playedMap } = data;
  return (
    <MatchOverview
      summaries={summaries}
      winSummaries={winSummaries}
      mapPool={mapPool}
      mapThumbnails={mapThumbnails}
      playedMap={playedMap}
      mainTeamIndex={mainTeamIndex}
      phase={phase}
      cardPhase={cardPhase}
      selfUserId={selfUserId}
      isDragging={isDragging}
    />
  );
}
