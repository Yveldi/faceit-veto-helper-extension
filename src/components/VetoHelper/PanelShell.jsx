import { useLayoutEffect, useRef, useState } from "react";
import icon from "../../assets/icon-128.png";

// A header icon-button. Stops pointerdown so pressing it never starts a window
// drag (the title bar around it is the drag handle).
function HeaderButton({ title, onClick, active, children }) {
  return (
    <button
      type="button"
      className={`fvh-hbtn${active ? " active" : ""}`}
      title={title}
      aria-pressed={active}
      onClick={onClick}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {children}
    </button>
  );
}

const LOCK_PATH =
  "M3.4 7.1h9.2a1.3 1.3 0 0 1 1.3 1.3v3.8a1.3 1.3 0 0 1-1.3 1.3H3.4a1.3 1.3 0 0 1-1.3-1.3V8.4a1.3 1.3 0 0 1 1.3-1.3Z";

// Progress of the brand strip for the current loading phase. Indeterminate while
// connecting (init), then a determinate fill that tracks players loaded.
function stripState(phase, loadedCount, totalCount) {
  if (phase === "init") return { indeterminate: true, fill: 0 };
  if (phase === "maps") return { indeterminate: false, fill: 14 };
  if (phase === "streaming") {
    const frac = totalCount ? loadedCount / totalCount : 0;
    return { indeterminate: false, fill: Math.round(14 + frac * 86) };
  }
  return { indeterminate: false, fill: 100 };
}

// The shared Stage 2 / Stage 3 panel chrome: a brand strip that doubles as a
// loading progress bar, a draggable title bar (icon + name + an inline loading
// status chip on Stage 3 + window buttons), then the stage body as children.
// The panel width animates as the body content changes (Stage 2 <-> 3, and the
// loading phases), measured from the natural-width body so it stays correct for
// any map-pool size.
export default function PanelShell({
  stage,
  phase,
  loadedCount,
  totalCount,
  statusText,
  locked,
  dragging,
  onToggleLock,
  onMinimize,
  onMaximize,
  onHeaderDown,
  children,
}) {
  const bodyRef = useRef(null);
  const [width, setWidth] = useState(null);

  // Track the body's natural (max-content) width and drive the panel width from
  // it, so the panel tweens smoothly when the body grows/shrinks.
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const measure = () => setWidth(body.scrollWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(body);
    return () => ro.disconnect();
  }, []);

  const cursor = locked ? "default" : dragging ? "grabbing" : "grab";
  const strip = stripState(phase, loadedCount, totalCount);
  const showStatus = stage === 3 && phase !== "loaded" && statusText;

  return (
    <div
      className="fvh-panel"
      style={{ width: width ? `${width}px` : undefined }}
    >
      <div className="fvh-brandstrip">
        {strip.indeterminate ? (
          <span className="fvh-brandstrip-indet" />
        ) : (
          <span
            className="fvh-brandstrip-fill"
            style={{ width: `${strip.fill}%` }}
          />
        )}
      </div>

      <div
        className="fvh-titlebar"
        style={{ cursor }}
        onPointerDown={onHeaderDown}
      >
        <span className="fvh-titlebar-icon">
          <img src={icon} alt="" draggable={false} />
        </span>
        <span className="fvh-titlebar-name">Faceit Veto Helper</span>
        {showStatus && (
          <span className="fvh-titlebar-status">
            <span className="fvh-spinner" />
            <span className="vh-num">{statusText}</span>
          </span>
        )}
        <div className="fvh-titlebar-buttons">
          <HeaderButton
            title={locked ? "Unlock position" : "Lock in place"}
            onClick={onToggleLock}
            active={locked}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path d={LOCK_PATH} fill="currentColor" />
              <path
                d="M5.4 7.1V5.2a2.6 2.6 0 0 1 5.2 0V7.1"
                stroke="currentColor"
                strokeWidth="1.5"
                fill="none"
              />
            </svg>
          </HeaderButton>
          <HeaderButton title="Minimize one stage" onClick={onMinimize}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path
                d="M4 6.5l4 4 4-4"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </HeaderButton>
          {stage === 2 && (
            <HeaderButton title="Maximize" onClick={onMaximize}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <path
                  d="M9.5 3H13v3.5M6.5 13H3V9.5"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </HeaderButton>
          )}
        </div>
      </div>

      <div className="fvh-panel-body" ref={bodyRef}>
        {children}
      </div>
    </div>
  );
}
