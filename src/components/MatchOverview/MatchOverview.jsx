import { useState } from "react";
import "./MatchOverview.css";
import PlayerMatrix from "./PlayerMatrix";
import MapWinProbabilities from "../MapWinProbabilities/MapWinProbabilities";

// Stage 3 layout: win-probability cards on the left, a per-player map matrix on
// the right. A single hovered-map (`hoverCol`) state is shared between them, so
// hovering a win-prob card highlights that map's column in the matrix and vice
// versa. Both sides stream in during the loading phases.
export default function MatchOverview({
  summaries,
  winSummaries,
  mapPool,
  mapThumbnails,
  playedMap,
  mainTeamIndex,
  phase,
  cardPhase,
  selfUserId,
  isDragging,
}) {
  const [hoverCol, setHoverCol] = useState(null);
  const otherIndex = mainTeamIndex === 0 ? 1 : 0;

  return (
    <div className="matchOverview">
      <div className="matchOverview-left">
        <MapWinProbabilities
          mainTeam={winSummaries?.[mainTeamIndex]}
          otherTeam={winSummaries?.[otherIndex]}
          mapPool={mapPool}
          mapThumbnails={mapThumbnails}
          playedMap={playedMap}
          phase={cardPhase}
          onMapEnter={setHoverCol}
          onMapLeave={() => setHoverCol(null)}
          activeMap={hoverCol}
        />
      </div>
      <PlayerMatrix
        teams={summaries}
        mapPool={mapPool}
        mapThumbnails={mapThumbnails}
        playedMap={playedMap}
        phase={phase}
        selfUserId={selfUserId}
        hoverCol={hoverCol}
        onColEnter={setHoverCol}
        onColLeave={() => setHoverCol(null)}
        isDragging={isDragging}
      />
    </div>
  );
}
