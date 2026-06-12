import WindowButton from "./WindowButton";

// Fully minimized: just a button to open Stage 2. Renders instantly; needs no
// match data.
export default function StageOne({ onExpand }) {
  return (
    <div className="fvh-stage fvh-stage1">
      <WindowButton onClick={onExpand} title="Open veto helper">
        Veto Helper ▸
      </WindowButton>
    </div>
  );
}
