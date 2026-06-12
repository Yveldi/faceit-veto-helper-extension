import { useCallback, useRef, useState } from "react";

// Pointer-drag for the overlay window. Returns the current offset, an
// `onPointerDown` to put on the draggable surface, and `isDragging` (used to
// suppress hover tooltips while moving). Buttons inside the window should call
// `stopPropagation` on pointerdown so clicking them doesn't start a drag.
export default function useDraggable(initial = { x: 24, y: 96 }) {
  const [position, setPosition] = useState(initial);
  const [isDragging, setIsDragging] = useState(false);
  const origin = useRef(null);

  const onPointerDown = useCallback(
    (e) => {
      // Only the primary (left) button drags.
      if (e.button !== 0) return;
      origin.current = {
        pointerX: e.clientX,
        pointerY: e.clientY,
        startX: position.x,
        startY: position.y,
      };
      setIsDragging(true);

      const onMove = (move) => {
        const o = origin.current;
        if (!o) return;
        setPosition({
          x: o.startX + (move.clientX - o.pointerX),
          y: o.startY + (move.clientY - o.pointerY),
        });
      };
      const onUp = () => {
        origin.current = null;
        setIsDragging(false);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [position],
  );

  return { position, isDragging, onPointerDown };
}
