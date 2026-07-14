import { createPortal } from "react-dom";
import { getPlayerHistory } from "../../playerTracking/store";
import { prettifyMapName } from "../../utils";
import Scroller from "./Scroller";

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

// One match row: W/L chip, then the map name over "score · Xd ago". Records
// harvested before the map was stored have no map; the score becomes the
// primary line so nothing looks broken.
function HistRow({ row }) {
  const win = (row.score?.[0] ?? 0) > (row.score?.[1] ?? 0);
  const score = `${row.score?.[0] ?? 0}-${row.score?.[1] ?? 0}`;
  const map = row.map ? prettifyMapName(row.map) : "";
  return (
    <a
      className="fvh-pc-histrow"
      href={ROOM_URL + row.matchId}
      target="_blank"
      rel="noopener noreferrer"
    >
      <span
        className="fvh-pc-histres"
        style={{
          color: win ? "#6fe09a" : "#ff8585",
          background: win ? "rgba(56,196,104,.16)" : "rgba(232,65,46,.15)",
        }}
      >
        {win ? "W" : "L"}
      </span>
      <div className="fvh-pc-histmid">
        <div className="fvh-pc-histmap">{map || score}</div>
        <div className="fvh-pc-histago">
          {map ? `${score} · ` : ""}
          {ago(row.date)} ago
        </div>
      </div>
    </a>
  );
}

// A match is a win when your score beat theirs (self-oriented [you, them]).
function isWin(r) {
  return (r.score?.[0] ?? 0) > (r.score?.[1] ?? 0);
}

// Per-side win-rate colour: green >=55, amber >=50, else red; gray for no data.
function wrColor(wr) {
  if (wr === null) return "#565a63";
  if (wr >= 55) return "#6fe09a";
  if (wr >= 50) return "#e6c14a";
  return "#ff8585";
}

// One of the two side-by-side columns (WITH YOU / AGAINST YOU). Its mini-header
// carries a per-side win-rate: a high WITH-YOU rate is good, a high VERSUS rate
// is a warning if that player later lands on your team. Only the WR tints the
// hairline under the label; the label + count stay plain above it.
function HistColumn({ label, color, rows }) {
  const wins = rows.filter(isWin).length;
  const wr = rows.length ? Math.round((wins / rows.length) * 100) : null;
  const wrC = wrColor(wr);
  return (
    <div className="fvh-pc-histcol">
      <div className="fvh-pc-histcolhead">
        <div className="fvh-pc-histcolrow1">
          <span className="fvh-pc-histdot" style={{ background: color }} />
          <span style={{ color }}>{label}</span>
          <span className="fvh-pc-histcolcount">{rows.length}</span>
        </div>
        <div className="fvh-pc-histcolrow2">
          <span
            className="fvh-pc-histcolline"
            style={{
              background: `linear-gradient(90deg, rgba(255,255,255,.08) 0%, rgba(255,255,255,.08) 62%, ${wrC}40 88%, ${wrC}99 100%)`,
            }}
          />
          <span className="fvh-pc-histcolwr" style={{ color: wrC }}>
            {wr === null ? "–" : `${wr}%`}
          </span>
        </div>
      </div>
      {rows.length ? (
        rows.map((r, i) => <HistRow key={r.matchId + i} row={r} />)
      ) : (
        <div className="fvh-pc-histempty">None</div>
      )}
    </div>
  );
}

// The played-with/against history popover. PORTALED to document.body and
// positioned fixed from the chip's rect, so it renders on top of everything and
// is never clipped by the roster column's overflow. Shared by the full player
// card and the compact sub/coach card. Layout per the tracker design: a minimal
// hairline "HISTORY" eyebrow, then two columns splitting the log into matches
// played WITH YOU vs AGAINST YOU (each column self-labels + counts, so no header
// glyph/label/total is needed).
export default function HistoryPopover({ guid, anchorRect }) {
  const rows = getPlayerHistory(guid);
  const withRows = rows.filter((r) => r.sameTeam);
  const vsRows = rows.filter((r) => !r.sameTeam);
  const W = 322;
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
        <Scroller className="fvh-pc-histscroll" maxHeight={210}>
          <div className="fvh-pc-histhead">
            <span className="fvh-pc-histeyebrow">HISTORY</span>
            <span className="fvh-pc-histrule" />
          </div>
          <div className="fvh-pc-histcols">
            <HistColumn label="WITH YOU" color="#6fe09a" rows={withRows} />
            <div className="fvh-pc-histcolsep" />
            <HistColumn label="AGAINST YOU" color="#ff8585" rows={vsRows} />
          </div>
        </Scroller>
      </div>
    </div>,
    document.body,
  );
}
