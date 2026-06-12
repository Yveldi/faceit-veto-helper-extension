import { useState } from "react";
import { createPortal } from "react-dom";
import { computeTeamScores } from "../../stats";
import useMatchIdFromUrl from "../../hooks/useMatchIdFromUrl";
import useSelfUserId from "../../hooks/useSelfUserId";
import useMatchData from "../../hooks/useMatchData";
import useDraggable from "../../hooks/useDraggable";
import DraggableWindow from "./DraggableWindow";
import StageOne from "./StageOne";
import StageTwo from "./StageTwo";
import StageThree from "./StageThree";

// Root of the Lobby Veto Helper overlay. Resolves the match (from the URL) and
// the user (local JWT), loads the data, and renders the active stage inside a
// draggable window. Renders nothing off a matchroom or when disabled.
export default function VetoHelper() {
  const matchId = useMatchIdFromUrl();
  const selfUserId = useSelfUserId();
  const [stage, setStage] = useState(2);
  const { position, isDragging, onPointerDown } = useDraggable();
  const data = useMatchData(matchId, selfUserId);

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
