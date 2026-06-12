import "./MatchOverview.css";
import TeamColumn from "./TeamColumn";
import MapWinProbabilities from "../MapWinProbabilities/MapWinProbabilities";

// Stage 3 full layout: [team 1] [win probabilities] [team 2]. Purely
// presentational — all data (enriched + summarised) is computed upstream and
// passed in, so there's a single source of truth and no load happens here.
export default function MatchOverview({
  summaries,
  mapPool,
  mapThumbnails,
  mainTeamIndex,
  hover,
}) {
  const otherIndex = mainTeamIndex === 0 ? 1 : 0;
  return (
    <div className="matchOverview">
      <TeamColumn
        team={summaries[0]}
        side="left"
        mapPool={mapPool}
        hover={hover}
      />
      <div className="matchOverview-middle">
        <MapWinProbabilities
          mainTeam={summaries[mainTeamIndex]}
          otherTeam={summaries[otherIndex]}
          mapPool={mapPool}
          mapThumbnails={mapThumbnails}
        />
      </div>
      <TeamColumn
        team={summaries[1]}
        side="right"
        mapPool={mapPool}
        hover={hover}
      />
    </div>
  );
}
