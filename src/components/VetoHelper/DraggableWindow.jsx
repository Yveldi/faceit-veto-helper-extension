import "./DraggableWindow.css";

// The fixed, draggable shell. The whole surface is a drag handle (buttons stop
// propagation). `.fvh-root` lives here so all overlay CSS is scoped to inside.
export default function DraggableWindow({ position, onPointerDown, children }) {
  return (
    <div
      className="fvh-root fvh-window"
      style={{ left: position.x, top: position.y }}
      onPointerDown={onPointerDown}
    >
      {children}
    </div>
  );
}
