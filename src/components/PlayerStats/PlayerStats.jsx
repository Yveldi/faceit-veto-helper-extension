import "./PlayerStats.css";
import { defaultMapPool, prettifyMapName } from "../../utils";
import Hoverable from "../Tooltip/Hoverable";
import Tooltip from "../Tooltip/Tooltip";

// Per-map rating strip. Presentational by default; pass the hover props to make
// each map cell interactive (Stage 3 player-factor tooltips). `renderTooltip`
// returns the tooltip body — Hoverable wraps it in the floating Tooltip.
export default function PlayerStats({
  stats,
  mapPool = defaultMapPool,
  backgroundColor = "#15171f",
  onMapEnter,
  onMapLeave,
  activeMap = null,
  renderTooltip,
}) {
  const interactive = Boolean(onMapEnter);
  return (
    <span className="PlayerStatCard" style={{ backgroundColor }}>
      {mapPool.map((map) => (
        <Hoverable
          key={map}
          className={`map${interactive ? " interactive" : ""}`}
          active={interactive && activeMap === map}
          onEnter={interactive ? () => onMapEnter(map) : undefined}
          onLeave={interactive ? onMapLeave : undefined}
          renderTooltips={
            interactive
              ? (ref) => (
                  <Tooltip anchorRef={ref}>{renderTooltip?.(map)}</Tooltip>
                )
              : undefined
          }
        >
          <span className="mapName">{prettifyMapName(map)}</span>
          <span className="rating">{stats[map] ? stats[map] : 0}</span>
        </Hoverable>
      ))}
    </span>
  );
}
