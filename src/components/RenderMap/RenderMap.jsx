import { useEffect, useState } from "react";
import "./RenderMap.css";
import { prettifyMapName, defaultMapThumbnail } from "../../utils";

export default function RenderMap({ map, mapThumbnail, winOdds }) {
  if (!mapThumbnail && defaultMapThumbnail[map]) mapThumbnail=defaultMapThumbnail[map]
  return (
    <span key={map} className="renderMap-root">
      <img src={mapThumbnail} />
      <span
        key={map}
        className="renderMap-text j-center a-center"
        style={{
          color: `hsl(${hue}, 100%, 40%)`,
        }}
      >
        <div>{prettifyMapName(map)}</div>
        {winOdds && <div>{winOdds}%</div>}
      </span>
    </span>
  );
}
