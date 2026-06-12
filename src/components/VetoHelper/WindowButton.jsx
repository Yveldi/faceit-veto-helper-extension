// A control inside the draggable window. Stops pointerdown from bubbling to the
// window so clicking a button never starts a drag.
export default function WindowButton({ onClick, title, disabled, children }) {
  return (
    <button
      type="button"
      className="fvh-btn"
      title={title}
      disabled={disabled}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
