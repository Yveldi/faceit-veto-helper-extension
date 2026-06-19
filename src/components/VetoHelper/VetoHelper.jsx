import { useState } from "react";
import { createPortal } from "react-dom";
import { computeTeamScores } from "../../stats";
import useDraggable from "../../hooks/useDraggable";
import DraggableWindow from "./DraggableWindow";
import StageOne from "./StageOne";
import StageTwo from "./StageTwo";
import StageThree from "./StageThree";

// Root of the Lobby Veto Helper overlay. Match data is loaded once in App and
// passed in; this renders the active stage inside a draggable window. Renders
// nothing off a matchroom.
export default function VetoHelper({ matchId, data }) {
  const [stage, setStage] = useState(2);
  const { position, isDragging, onPointerDown } = useDraggable();

  if (!matchId) return null;

  // Team summaries are cheap and depend only on loaded data, so compute them at
  // render time — no second source of state to drift.
  const summaries = data.teams
    ? data.teams.map((team) => ({
        ...team,
        ...computeTeamScores(team.roster, data.mapPool),
      }))
    : null;

  return createPortal(
    <DraggableWindow position={position} onPointerDown={onPointerDown}>
      {stage === 1 && <StageOne onExpand={() => setStage(2)} />}
      {stage === 2 && (
        <StageTwo
          isDragging={isDragging}
          data={data}
          summaries={summaries}
          onMinimize={() => setStage(1)}
          onExpand={() => setStage(3)}
        />
      )}
      {stage === 3 && (
        <StageThree
          isDragging={isDragging}
          data={data}
          summaries={summaries}
          onMinimize={() => setStage(2)}
        />
      )}
    </DraggableWindow>,
    document.body,
  );
}
