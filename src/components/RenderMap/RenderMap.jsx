import "./RenderMap.css";
import { prettifyMapName, defaultMapThumbnail } from "../../utils";

export default function RenderMap({ map, mapThumbnail, winOdds }) {
  const thumbnail = mapThumbnail ?? defaultMapThumbnail[map];
  const hasOdds = typeof winOdds === "number";
  // 0 = red, 60 = yellow, 120 = green. convenient.
  const hue = (winOdds / 100) * 120;

  return (
    <span className="renderMap-root">
      {thumbnail && <img src={thumbnail} alt={map} draggable={false} />}
      <span
        className="renderMap-text"
        style={hasOdds ? { color: `hsl(${hue}, 100%, 40%)` } : undefined}
      >
        <div>{prettifyMapName(map)}</div>
        {hasOdds && <div>{winOdds}%</div>}
      </span>
    </span>
  );
}
