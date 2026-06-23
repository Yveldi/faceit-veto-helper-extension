import { useCallback, useState } from "react";

// Movement (px) before a press becomes a drag rather than a click. Lets buttons
// inside the window be dragged from while still being clickable.
const DRAG_THRESHOLD = 4;

// Pointer-drag for the overlay window. Controlled: the caller owns `position`
// (so it can be loaded from / saved to storage). Calls `onMove(pos)` once a
// drag passes the threshold and `onDrop()` when it ends — the caller clamps and
// persists there. Dragging is disabled while `locked`. The whole surface drags,
// INCLUDING buttons: a press that doesn't move stays a click; a press that moves
// drags the window, and the trailing click (the button stays under the cursor as
// the window follows it) is swallowed so it doesn't also fire the button.
export default function useDraggable({ position, onMove, onDrop, locked }) {
  const [isDragging, setIsDragging] = useState(false);

  const onPointerDown = useCallback(
    (e) => {
      // Locked, or not the primary (left) button: no drag.
      if (locked || e.button !== 0) return;
      const start = {
        pointerX: e.clientX,
        pointerY: e.clientY,
        startX: position.x,
        startY: position.y,
      };
      let dragging = false;

      const move = (m) => {
        const dx = m.clientX - start.pointerX;
        const dy = m.clientY - start.pointerY;
        if (!dragging) {
          if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
          dragging = true;
          setIsDragging(true);
        }
        onMove({ x: start.startX + dx, y: start.startY + dy });
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        if (!dragging) return; // never moved past the threshold: it was a click
        setIsDragging(false);
        onDrop();
        // Swallow the click this drag would otherwise trigger (e.g. on a button
        // we started the drag from). Capture on document beats any React handler
        // regardless of where it listens; self-removes on that click, with a
        // short fallback in case no click is dispatched.
        const swallow = (ev) => {
          ev.stopPropagation();
          ev.preventDefault();
          document.removeEventListener("click", swallow, true);
        };
        document.addEventListener("click", swallow, true);
        setTimeout(() => document.removeEventListener("click", swallow, true), 300);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [position, onMove, onDrop, locked],
  );

  return { isDragging, onPointerDown };
}
