import { createPortal } from "react-dom";
import { ESEA_SVG, FPL_SVG, eseaDivColor } from "./cardHelpers";

// One row in a corner popover.
function PopRow({ label, value, color }) {
  return (
    <div className="fvh-pc-esearow">
      <span className="fvh-pc-esealbl">{label}</span>
      <span className="fvh-pc-eseaval" style={color ? { color } : undefined}>
        {value}
      </span>
    </div>
  );
}

// The bottom-left corner badge's hover popover. Two variants, driven by which
// badge is showing (FPL takes priority over ESEA on the card):
//   - "fpl": FACEIT Pro League header + FPL Rank + Region (from src/fplStatus.js)
//   - "esea": ESEA League header + either Division + Region (on a league team,
//     from src/teamLeagues.js) or "Subscription: Active" when the player has the
//     ESEA membership but no current team.
// Portaled to document.body and fixed-positioned from the badge's rect so it's
// never clipped by the roster column's overflow. Read-only (pointer-events off).
// Shared by the full player card and the compact sub/coach card.
export default function CornerPopover({
  variant,
  league,
  fpl,
  anchorRect,
  mirror,
}) {
  const W = 198;
  const gap = 8;
  // Sit beside the badge: to the right for the left team, to the left when the
  // card is mirrored (right team). Clamp to the viewport on both axes.
  let left = mirror ? anchorRect.left - gap - W : anchorRect.right + gap;
  left = Math.max(8, Math.min(left, window.innerWidth - W - 8));
  const top = Math.max(
    8,
    Math.min(anchorRect.top - 6, window.innerHeight - 110),
  );

  const isFpl = variant === "fpl";
  const header = isFpl ? "FACEIT Pro League" : league?.league || "ESEA League";
  const icon = isFpl ? FPL_SVG : ESEA_SVG;

  let rows;
  if (isFpl) {
    rows = (
      <>
        <PopRow
          label="FPL Rank"
          value={fpl?.rank != null ? `#${fpl.rank}` : "Unranked"}
          color="#ff8a5c"
        />
        <PopRow label="Region" value={fpl?.region || "—"} />
      </>
    );
  } else if (league?.division) {
    // On a team competing in the league → has a Division + Region.
    rows = (
      <>
        <PopRow
          label="Division"
          value={league.division}
          color={eseaDivColor(league.division)}
        />
        {league.region && <PopRow label="Region" value={league.region} />}
      </>
    );
  } else {
    // ESEA membership but no team → subscription only (matches FACEIT's native
    // UI). No ladder to show.
    rows = <PopRow label="Subscription" value="Active" color="#38c468" />;
  }

  return createPortal(
    <div
      className="fvh-root"
      style={{
        position: "fixed",
        left,
        top,
        width: W,
        zIndex: 2147483000,
        pointerEvents: "none",
      }}
    >
      <div className={`fvh-pc-eseapop ${isFpl ? "fpl" : ""}`}>
        <div className="fvh-pc-eseahead">
          <span
            className="fvh-pc-eseahead-ic"
            dangerouslySetInnerHTML={{ __html: icon }}
          />
          <span className={`fvh-pc-eseahead-tx ${isFpl ? "fpl" : ""}`}>
            {header}
          </span>
        </div>
        {rows}
      </div>
    </div>,
    document.body,
  );
}
