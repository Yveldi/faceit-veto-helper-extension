import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./Tooltip.css";

// Floating tooltip portaled to document.body so it's never clipped by the
// window's bounds, however small the window gets. `placement` is "auto" (above,
// flipping below when there's no room), forced "above" / "below", or "side"
// (to the right of the anchor, flipping left when there's no room, top-aligned
// with the anchor). Always clamped to the viewport.
export default function Tooltip({
  anchorRef,
  placement = "auto",
  gap = 8,
  children,
}) {
  const tipRef = useRef(null);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const tip = tipRef.current;
    if (!anchor || !tip) return;
    const a = anchor.getBoundingClientRect();
    const t = tip.getBoundingClientRect();

    if (placement === "side") {
      // Prefer to the right of the anchor; flip to the left if it won't fit.
      const right = a.right + gap;
      const left = a.left - gap - t.width;
      let l = right + t.width <= window.innerWidth - 4 ? right : left;
      l = Math.max(4, Math.min(l, window.innerWidth - t.width - 4));
      const top = Math.max(
        4,
        Math.min(a.top, window.innerHeight - t.height - 4),
      );
      setPos({ top, left: l });
      return;
    }

    const above = a.top - gap - t.height;
    const below = a.bottom + gap;

    let top;
    if (placement === "above") top = above;
    else if (placement === "below") top = below;
    else top = above < 4 ? below : above;
    top = Math.max(4, Math.min(top, window.innerHeight - t.height - 4));

    let left = a.left + a.width / 2 - t.width / 2;
    left = Math.max(4, Math.min(left, window.innerWidth - t.width - 4));

    setPos({ top, left });
  }, [anchorRef, children, placement, gap]);

  return createPortal(
    <div className="fvh-root">
      <div
        ref={tipRef}
        className="fvh-tooltip"
        role="tooltip"
        style={pos ? { top: pos.top, left: pos.left } : { opacity: 0 }}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
