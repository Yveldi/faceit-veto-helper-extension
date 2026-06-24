import { useRef } from "react";

// A hoverable cell. While `active`, it calls `renderTooltips(anchorRef)` — which
// may return one or several <Tooltip> elements all anchored to this cell.
export default function Hoverable({
  className,
  style,
  active,
  onEnter,
  onLeave,
  renderTooltips,
  children,
}) {
  const ref = useRef(null);
  return (
    <div
      ref={ref}
      className={className}
      style={style}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
    >
      {children}
      {active && renderTooltips?.(ref)}
    </div>
  );
}
