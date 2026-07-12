import { createPortal } from "react-dom";
import { statusIcon } from "./cardHelpers";

// Hover popover for the AFK/KICKED/LEAVER status banner (design 9a). Icon +
// label header (in the status colour, over a divider) then the description line.
// Portaled to document.body and fixed-positioned just below the banner pill so
// it's never clipped by the roster column's overflow (matches CornerPopover /
// HistoryPopover). Read-only — pointer-events off.
export default function StatusPopover({ meta, anchorRect }) {
  const W = 236; // max-width; content may be narrower (min-width 172 in CSS)
  let left = anchorRect.left;
  left = Math.max(8, Math.min(left, window.innerWidth - W - 8));
  const top = Math.min(anchorRect.bottom + 6, window.innerHeight - 120);
  return createPortal(
    <div
      className="fvh-root"
      style={{
        position: "fixed",
        left,
        top,
        zIndex: 2147483000,
        pointerEvents: "none",
      }}
    >
      <div className="fvh-pc-statpop" style={{ borderColor: meta.bd }}>
        <div className="fvh-pc-stathead" style={{ color: meta.color }}>
          <span
            className="fvh-pc-stathead-ic"
            dangerouslySetInnerHTML={{ __html: statusIcon(meta.icon, 15) }}
          />
          <span className="fvh-pc-stathead-tx">{meta.label}</span>
        </div>
        <div className="fvh-pc-statdesc">{meta.desc}</div>
      </div>
    </div>,
    document.body,
  );
}
