import WindowButton from "./WindowButton";
import LoadingDot from "../LoadingDot/LoadingDot";
import MapWinProbabilities from "../MapWinProbabilities/MapWinProbabilities";
import useHoverIntent from "../../hooks/useHoverIntent";

// Default stage: per-map win probabilities for the main team. Hovering a map
// reveals each main-team player's rating for it.
export default function StageTwo({
  isDragging,
  data,
  summaries,
  onMinimize,
  onExpand,
}) {
  const hover = useHoverIntent(isDragging);
  const { mapPool, mapThumbnails, mainTeamIndex, loading } = data;
  const otherIndex = mainTeamIndex === 0 ? 1 : 0;

  return (
    <div className="fvh-stage">
      <div className="fvh-window-header">
        <WindowButton onClick={onMinimize} title="Minimize">
          ▾
        </WindowButton>
        <WindowButton
          onClick={onExpand}
          title={loading ? "Loading…" : "Expand"}
          disabled={loading}
        >
          ⤢
        </WindowButton>
      </div>
      {loading || !summaries ? (
        <LoadingDot />
      ) : (
        <MapWinProbabilities
          mainTeam={summaries[mainTeamIndex]}
          otherTeam={summaries[otherIndex]}
          mapPool={mapPool}
          mapThumbnails={mapThumbnails}
          hover={hover}
        />
      )}
    </div>
  );
}
