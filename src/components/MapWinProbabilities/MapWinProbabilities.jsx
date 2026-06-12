import "./MapWinProbabilities.css";
import RenderMap from "../RenderMap/RenderMap";
import Hoverable from "../Tooltip/Hoverable";
import Tooltip from "../Tooltip/Tooltip";
import MapPlayerRatings from "../Tooltip/MapPlayerRatings";
import { computeMapWinProbabilities } from "../../stats";

// Maps for the main team with per-map win probability, worst first (ban
// order). Pass `hover` (from useHoverIntent) to enable the Stage 2 tooltip that
// shows each main-team player's rating for the hovered map.
export default function MapWinProbabilities({
  mainTeam,
  otherTeam,
  mapPool,
  mapThumbnails,
  hover,
}) {
  const probabilities = computeMapWinProbabilities({
    mainTeam,
    otherTeam,
    mapPool,
  });
  const sorted = [...mapPool].sort(
    (a, b) => probabilities[a] - probabilities[b],
  );
  const interactive = Boolean(hover);

  return (
    <div className="mapWinProbs">
      <p className="mapWinProbs-title">
        Win probability for{" "}
        <span className="mainTeamName">{mainTeam.name}</span>
      </p>
      <div className="mapWinProbs-list">
        {sorted.map((map) => (
          <Hoverable
            key={map}
            className="mapWinProbs-item"
            active={interactive && hover.activeKey === map}
            onEnter={interactive ? () => hover.onEnter(map) : undefined}
            onLeave={interactive ? hover.onLeave : undefined}
            renderTooltips={
              interactive
                ? (ref) => (
                    <>
                      <Tooltip anchorRef={ref} placement="above">
                        <MapPlayerRatings team={mainTeam} map={map} highlight />
                      </Tooltip>
                      <Tooltip anchorRef={ref} placement="below">
                        <MapPlayerRatings team={otherTeam} map={map} />
                      </Tooltip>
                    </>
                  )
                : undefined
            }
          >
            <RenderMap
              map={map}
              mapThumbnail={mapThumbnails[map]}
              winOdds={probabilities[map]}
            />
          </Hoverable>
        ))}
      </div>
    </div>
  );
}
