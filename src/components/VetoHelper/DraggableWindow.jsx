import "./DraggableWindow.css";

// The fixed overlay shell. It only positions the window; dragging is now wired
// to the panel's title bar (and the Stage 1 logo) instead of the whole surface,
// so hovering the body never risks starting a drag. `.fvh-root` lives here so
// all overlay CSS stays scoped to inside it.
export default function DraggableWindow({ position, windowRef, children }) {
  return (
    <div
      ref={windowRef}
      className="fvh-root fvh-window"
      style={{ left: position.x, top: position.y }}
    >
      {children}
    </div>
  );
}
