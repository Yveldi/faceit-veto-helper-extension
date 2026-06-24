import { winRateColor, ratingColor } from "../../colors";
import { prettifyMapName } from "../../utils";

// Stage 3 cell hover body: one player's stats on one specific map. Three tiles
// (matches / win rate / FACEIT rating) when the player has recent matches on the
// map, else a muted "no matches" note. `stat` is the raw per-map tuple
// [rating, winRate, count] from getPlayerStats, or undefined when the player has
// no rated history on the map.
export default function CellStatsPopover({ player, map, teamColor, stat }) {
  const [rating, winRate, count] = stat ?? [];
  const hasMatches = typeof count === "number" && count > 0;

  return (
    <div className="fvh-cellpop">
      <div className="fvh-cellpop-head">
        <span className="dot" style={{ background: teamColor }} />
        <span className="who">{player} ON</span>
      </div>
      <div className="fvh-cellpop-map">{prettifyMapName(map)}</div>
      {hasMatches ? (
        <div className="fvh-cellpop-tiles">
          <div className="fvh-cellpop-tile">
            <span className="num">{count}</span>
            <span className="lbl">MATCHES</span>
          </div>
          <div className="fvh-cellpop-tile">
            <span className="num" style={{ color: winRateColor(winRate) }}>
              {Math.round(winRate)}%
            </span>
            <span className="lbl">WIN RATE</span>
          </div>
          <div className="fvh-cellpop-tile">
            <span className="num" style={{ color: ratingColor(rating) }}>
              {rating.toFixed(2)}
            </span>
            <span className="lbl">RATING</span>
          </div>
        </div>
      ) : (
        <div className="fvh-cellpop-empty">No matches on this map recently</div>
      )}
    </div>
  );
}
