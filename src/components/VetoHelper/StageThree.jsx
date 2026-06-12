import WindowButton from "./WindowButton";
import LoadingDot from "../LoadingDot/LoadingDot";
import MatchOverview from "../MatchOverview/MatchOverview";
import useHoverIntent from "../../hooks/useHoverIntent";

// Expanded stage: full per-player breakdown plus the win probabilities. Map
// hover is disabled here (that info is shown directly); instead hovering a
// player's per-map rating reveals the factors behind it.
export default function StageThree({ isDragging, data, summaries, onMinimize }) {
  const hover = useHoverIntent(isDragging);
  const { mapPool, mapThumbnails, mainTeamIndex, loading } = data;

  return (
    <div className="fvh-stage">
      <div className="fvh-window-header">
        <WindowButton onClick={onMinimize} title="Minimize">
          ▾
        </WindowButton>
      </div>
      {loading || !summaries ? (
        <LoadingDot />
      ) : (
        <MatchOverview
          summaries={summaries}
          mapPool={mapPool}
          mapThumbnails={mapThumbnails}
          mainTeamIndex={mainTeamIndex}
          hover={hover}
        />
      )}
    </div>
  );
}
