import icon from "../../assets/icon-128.png";

// Fully minimized: the logo itself is the button (the "Logo" Stage 1 style).
// Press-and-move drags the window; a plain click opens Stage 2 (useDraggable
// swallows the trailing click of a real drag). Needs no match data.
export default function StageOne({ onExpand, onHeaderDown }) {
  return (
    <div
      className="fvh-stage1-logo"
      title="Open veto helper"
      onPointerDown={onHeaderDown}
      onClick={onExpand}
    >
      <img src={icon} alt="Faceit Veto Helper" draggable={false} />
      <span className="fvh-stage1-badge">
        <svg width="9" height="9" viewBox="0 0 16 16" fill="none">
          <path
            d="M6 4l4 4-4 4"
            stroke="#1a1003"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </div>
  );
}
