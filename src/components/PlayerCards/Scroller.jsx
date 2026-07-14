import { useCallback, useEffect, useRef, useState } from "react";

const MIN_THUMB = 24;

// A custom overlay scrollbar, so surfaces render their OWN scroller instead of
// depending on the browser/OS native bar. The design's `::-webkit-scrollbar`
// styling is Chromium-only and is ignored on Firefox (our primary target), so
// there it would fall back to the native OS bar. Here the content scrolls
// natively with the native bar hidden (see .fvh-scroller-view CSS), and we draw
// a track + draggable thumb on top and keep it in sync with scroll/resize.
export default function Scroller({ className = "", maxHeight, children }) {
  const viewRef = useRef(null);
  const dragRef = useRef(null);
  const [thumb, setThumb] = useState({ show: false, height: 0, top: 0 });
  const [dragging, setDragging] = useState(false);

  // Recompute thumb size/position from the view's scroll metrics.
  const sync = useCallback(() => {
    const el = viewRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight <= clientHeight + 1) {
      setThumb((t) => (t.show ? { show: false, height: 0, top: 0 } : t));
      return;
    }
    const height = Math.max(MIN_THUMB, (clientHeight / scrollHeight) * clientHeight);
    const maxTop = clientHeight - height;
    const top = maxTop * (scrollTop / (scrollHeight - clientHeight));
    setThumb({ show: true, height, top });
  }, []);

  // Keep in sync as the view or its content resizes.
  useEffect(() => {
    sync();
    const el = viewRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, [sync, children]);

  // Drag the thumb -> scroll the view (mapping thumb travel to scroll range).
  const onThumbDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const el = viewRef.current;
    if (!el) return;
    dragRef.current = { startY: e.clientY, startTop: el.scrollTop };
    setDragging(true);
    const move = (ev) => {
      const view = viewRef.current;
      if (!view || !dragRef.current) return;
      const { scrollHeight, clientHeight } = view;
      const height = Math.max(
        MIN_THUMB,
        (clientHeight / scrollHeight) * clientHeight,
      );
      const maxTop = clientHeight - height;
      if (maxTop <= 0) return;
      const dy = ev.clientY - dragRef.current.startY;
      view.scrollTop =
        dragRef.current.startTop +
        (dy / maxTop) * (scrollHeight - clientHeight);
    };
    const up = () => {
      dragRef.current = null;
      setDragging(false);
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  };

  return (
    <div className="fvh-scroller" style={{ maxHeight }}>
      <div
        className={`fvh-scroller-view ${className}`}
        ref={viewRef}
        onScroll={sync}
        style={{ maxHeight }}
      >
        {children}
      </div>
      {thumb.show && (
        <div className="fvh-scroller-track">
          <div
            className={`fvh-scroller-thumb${dragging ? " fvh-scroller-thumb-drag" : ""}`}
            style={{
              height: `${thumb.height}px`,
              transform: `translateY(${thumb.top}px)`,
            }}
            onMouseDown={onThumbDown}
          />
        </div>
      )}
    </div>
  );
}
