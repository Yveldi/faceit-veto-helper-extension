import { createPortal } from "react-dom";
import { getPlayerHistory } from "../../playerTracking/store";

const ROOM_URL = "https://www.faceit.com/en/cs2/room/";

// Relative "2d ago" style label from unix seconds.
function ago(unixSeconds) {
  if (!unixSeconds) return "";
  const secs = Math.max(0, Math.floor(Date.now() / 1000) - unixSeconds);
  const d = Math.floor(secs / 86400);
  if (d >= 1) return `${d}d`;
  const h = Math.floor(secs / 3600);
  if (h >= 1) return `${h}h`;
  const m = Math.floor(secs / 60);
  return `${m}m`;
}

// The played-with/against history popover. PORTALED to document.body and
// positioned fixed from the chip's rect, so it renders on top of everything and
// is never clipped by the roster column's overflow. Shared by the full player
// card and the compact sub/coach card.
export default function HistoryPopover({ guid, meta, anchorRect }) {
  const rows = getPlayerHistory(guid);
  const W = 250;
  const left = Math.max(
    8,
    Math.min(anchorRect.left, window.innerWidth - W - 8),
  );
  const top = Math.min(anchorRect.bottom + 6, window.innerHeight - 260);
  return createPortal(
    // Wrapped in a bare .fvh-root so the scoped `.fvh-root .fvh-pc-histpop`
    // styles (and the host-CSS reset) actually apply once portaled to body.
    <div
      className="fvh-root"
      style={{ position: "fixed", left, top, zIndex: 2147483000 }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="fvh-pc-histpop" style={{ position: "static" }}>
        <div className="fvh-pc-histhead">
          <span style={{ color: meta.color }}>
            {meta.glyph} {meta.label}
          </span>
          <span className="fvh-pc-histcount">{rows.length} matches</span>
        </div>
        <div className="fvh-pc-histscroll">
          {rows.map((r, i) => {
            const win = (r.score?.[0] ?? 0) > (r.score?.[1] ?? 0);
            return (
              <a
                className="fvh-pc-histrow"
                key={r.matchId + i}
                href={ROOM_URL + r.matchId}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span
                  className="fvh-pc-histres"
                  style={{
                    color: win ? "#6fe09a" : "#ff8585",
                    background: win
                      ? "rgba(56,196,104,.16)"
                      : "rgba(232,65,46,.15)",
                  }}
                >
                  {win ? "W" : "L"}
                </span>
                <div className="fvh-pc-histmid">
                  <div className="fvh-pc-histscore">
                    {(r.score?.[0] ?? 0)} - {(r.score?.[1] ?? 0)}
                  </div>
                  <div className="fvh-pc-histago">{ago(r.date)} ago</div>
                </div>
                <span
                  className="fvh-pc-histside"
                  style={{ color: r.sameTeam ? "#6fe09a" : "#ff8585" }}
                >
                  {r.sameTeam ? "WITH" : "VERSUS"}
                </span>
              </a>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
