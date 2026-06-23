import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { computeTeamScores, estimateWinSummaries } from "../../stats";
import { clampToViewport } from "../../utils";
import {
  updateSettings,
  saveVetoHelperPosition,
  loadVetoHelperPosition,
} from "../../settings";
import useDraggable from "../../hooks/useDraggable";
import DraggableWindow from "./DraggableWindow";
import PanelShell from "./PanelShell";
import StageOne from "./StageOne";
import StageTwo from "./StageTwo";
import StageThree from "./StageThree";

const DEFAULT_POSITION = { x: 24, y: 96 };

// Loading status line shared by the Stage 3 title chip and the Stage 2 body.
function statusFor(phase, loadedCount, totalCount) {
  if (phase === "init") return "Loading…";
  if (phase === "maps") return `0 / ${totalCount || 10} players`;
  if (phase === "streaming") return `${loadedCount} / ${totalCount} players`;
  return "";
}

// Root of the Lobby Veto Helper overlay. The logo (Stage 1) and the panel
// (Stage 2/3) are BOTH mounted, stacked at the same corner, and crossfaded by
// opacity/scale so switching stages animates instead of snapping. The panel
// itself stays mounted across Stage 2<->3 (its width tweens via PanelShell).
export default function VetoHelper({ matchId, data, locked }) {
  const [stage, setStage] = useState(2);
  const [position, setPosition] = useState(null); // null until loaded
  const windowRef = useRef(null);
  const clampedOnce = useRef(false);

  useEffect(() => {
    let alive = true;
    loadVetoHelperPosition().then((saved) => {
      if (alive) setPosition(saved ?? DEFAULT_POSITION);
    });
    return () => {
      alive = false;
    };
  }, []);

  useLayoutEffect(() => {
    if (clampedOnce.current || !position || !windowRef.current) return;
    clampedOnce.current = true;
    const clamped = clampToViewport(position, windowRef.current);
    if (clamped.x !== position.x || clamped.y !== position.y) {
      setPosition(clamped);
      saveVetoHelperPosition(clamped);
    }
  }, [position]);

  const onMove = useCallback((pos) => setPosition(pos), []);
  const onDrop = useCallback(() => {
    setPosition((pos) => {
      const clamped = clampToViewport(pos, windowRef.current);
      saveVetoHelperPosition(clamped);
      return clamped;
    });
  }, []);

  const { isDragging, onPointerDown } = useDraggable({
    position: position ?? DEFAULT_POSITION,
    onMove,
    onDrop,
    locked,
  });

  const toggleLock = useCallback(
    () => updateSettings({ vetoHelperLocked: !locked }),
    [locked],
  );

  if (!matchId || !position) return null;

  const { phase, loadedCount, totalCount } = data;
  const statusText = statusFor(phase, loadedCount, totalCount);

  // The win-probability cards need at least one player from BOTH teams before
  // any comparison is meaningful (players load one team at a time, so until the
  // enemy team starts loading every map would sit at a flat ~50%). Hold the
  // cards in the placeholder ("maps") state until then; the matrix still streams
  // per-player from the first player. The status/strip keep tracking real
  // progress.
  const bothTeamsHaveData =
    !!data.teams &&
    data.teams.length >= 2 &&
    data.teams.every((t) => t.roster.some((p) => p.loaded));
  const cardPhase =
    phase === "streaming" && !bothTeamsHaveData ? "maps" : phase;

  // Real per-map team scores (used by the Stage 3 matrix + the hover breakdown,
  // which show actual loaded players only). Partial during streaming, final when
  // loaded.
  const summaries = data.teams
    ? data.teams.map((team) => ({
        ...team,
        ...computeTeamScores(team.roster, data.mapPool),
      }))
    : null;
  // For the win-probability cards, stand in for not-yet-loaded players so the %
  // settles believably instead of spiking while one team is half-empty. Equal to
  // `summaries` once everything is loaded.
  const winSummaries = data.teams
    ? estimateWinSummaries(data.teams, data.mapPool)
    : null;

  const isStage1 = stage === 1;
  const logoStyle = {
    opacity: isStage1 ? 1 : 0,
    transform: `scale(${isStage1 ? 1 : 1.25})`,
    transformOrigin: "23px 23px",
    pointerEvents: isStage1 ? "auto" : "none",
  };
  const panelStyle = {
    opacity: isStage1 ? 0 : 1,
    transform: `scale(${isStage1 ? 0.92 : 1})`,
    transformOrigin: "20px 20px",
    pointerEvents: isStage1 ? "none" : "auto",
  };

  return createPortal(
    <DraggableWindow position={position} windowRef={windowRef}>
      <div className="fvh-layer fvh-logo-layer" style={logoStyle}>
        <StageOne onExpand={() => setStage(2)} onHeaderDown={onPointerDown} />
      </div>
      <div className="fvh-layer fvh-panel-layer" style={panelStyle}>
        <PanelShell
          stage={stage}
          phase={phase}
          loadedCount={loadedCount}
          totalCount={totalCount}
          statusText={statusText}
          locked={locked}
          dragging={isDragging}
          onToggleLock={toggleLock}
          onMinimize={() => setStage((s) => Math.max(1, s - 1))}
          onMaximize={() => setStage(3)}
          onHeaderDown={onPointerDown}
        >
          {stage === 3 ? (
            <StageThree
              data={data}
              summaries={summaries}
              winSummaries={winSummaries}
              phase={phase}
              cardPhase={cardPhase}
            />
          ) : (
            <StageTwo
              isDragging={isDragging}
              data={data}
              winSummaries={winSummaries}
              phase={phase}
              cardPhase={cardPhase}
              statusText={statusText}
            />
          )}
        </PanelShell>
      </div>
    </DraggableWindow>,
    document.body,
  );
}
