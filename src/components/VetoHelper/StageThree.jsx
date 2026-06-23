import MatchOverview from "../MatchOverview/MatchOverview";

// Expanded stage body: win-probability cards next to a per-player map matrix.
// Both stream in during loading (cards settle, matrix fills row by row).
export default function StageThree({
  data,
  summaries,
  winSummaries,
  phase,
  cardPhase,
}) {
  const { mapPool, mapThumbnails, mainTeamIndex } = data;
  return (
    <MatchOverview
      summaries={summaries}
      winSummaries={winSummaries}
      mapPool={mapPool}
      mapThumbnails={mapThumbnails}
      mainTeamIndex={mainTeamIndex}
      phase={phase}
      cardPhase={cardPhase}
    />
  );
}
