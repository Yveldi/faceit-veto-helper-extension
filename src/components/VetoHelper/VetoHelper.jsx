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
import useVetoProgress from "../../hooks/useVetoProgress";
import DraggableWindow from "./DraggableWindow";
import PanelShell from "./PanelShell";
import StageOne from "./StageOne";
import StageTwo from "./StageTwo";
import StageThree from "./StageThree";

const DEFAULT_POSITION = { x: 24, y: 96 };

// The window root has no size (both stage layers are absolutely positioned), so
// measure whichever layer is currently visible. Stage 1 shows the logo layer;
// Stage 2/3 show the panel layer. Use offsetWidth/Height, NOT
// getBoundingClientRect: the crossfade tweens a `transform: scale()` on the
// layer, which getBoundingClientRect would fold into the size (reading the
// mid-tween 0.92 scale and under-measuring), whereas offset sizes report the
// true resting layout footprint regardless of the transform.
function measureVisible(root, stage) {
  if (!root) return null;
  const layer = root.querySelector(
    stage === 1 ? ".fvh-logo-layer" : ".fvh-panel-layer",
  );
  if (!layer) return null;
  const width = layer.offsetWidth;
  const height = layer.offsetHeight;
  return width && height ? { width, height } : null;
}

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
export default function VetoHelper({ matchId, data, selfUserId, locked }) {
  const [stage, setStage] = useState(2);
  const [position, setPosition] = useState(null); // null until loaded
  const windowRef = useRef(null);
  const positionRef = useRef(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    let alive = true;
    loadVetoHelperPosition().then((saved) => {
      if (alive) setPosition(saved ?? DEFAULT_POSITION);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Keep the latest position reachable from the size/resize observers (which run
  // outside React's render and would otherwise close over a stale value).
  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  // Push the window inward to fit its CURRENT footprint. Runs on load, on every
  // size change of the visible layer (Stage 2 -> 3, body growing/shrinking as
  // players stream in, the Regret Helper toggling the pool) and on viewport
  // resize. Skipped mid-drag so it never fights the user's pointer.
  const reclamp = useCallback(() => {
    if (draggingRef.current) return;
    const pos = positionRef.current;
    if (!pos) return;
    const size = measureVisible(windowRef.current, stage);
    const clamped = clampToViewport(pos, size);
    if (clamped.x !== pos.x || clamped.y !== pos.y) {
      setPosition(clamped);
      saveVetoHelperPosition(clamped);
    }
  }, [stage]);

  useLayoutEffect(() => {
    if (!position || !windowRef.current) return;
    reclamp();
    const layer = windowRef.current.querySelector(
      stage === 1 ? ".fvh-logo-layer" : ".fvh-panel-layer",
    );
    const ro = layer ? new ResizeObserver(() => reclamp()) : null;
    if (ro && layer) ro.observe(layer);
    window.addEventListener("resize", reclamp);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", reclamp);
    };
    // position is intentionally excluded: re-subscribing on every drag tick would
    // thrash the observer. The observer reads the live position via the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, reclamp, !!position]);

  // Constrain the window to the viewport AS it moves, so it can never be dragged
  // past an edge in the first place (preventive, not a snap-back on drop).
  const onMove = useCallback(
    (pos) => {
      draggingRef.current = true;
      const size = measureVisible(windowRef.current, stage);
      setPosition(clampToViewport(pos, size));
    },
    [stage],
  );
  const onDrop = useCallback(() => {
    draggingRef.current = false;
    setPosition((pos) => {
      saveVetoHelperPosition(pos);
      return pos;
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

  // Live veto progress from the DOM: drop banned maps from the pool as they're
  // banned, without refetching match/v2 (see useVetoProgress).
  const { banned, sawVeto } = useVetoProgress(matchId, data.mapPool);

  if (!matchId || !position) return null;

  const { phase, loadedCount, totalCount } = data;
  const statusText = statusFor(phase, loadedCount, totalCount);

  // Apply live veto progress: once we've witnessed an active veto, drop the
  // banned maps from the displayed pool and — when a single map remains — treat
  // it as the played map (the "now playing" highlight). Until then, use the
  // fetched pool / playedMap unchanged.
  const livePool =
    sawVeto && banned.size
      ? data.mapPool.filter((m) => !banned.has(m))
      : data.mapPool;
  const livePlayedMap =
    sawVeto && livePool.length === 1 ? livePool[0] : data.playedMap;
  const liveData =
    livePool === data.mapPool && livePlayedMap === data.playedMap
      ? data
      : { ...data, mapPool: livePool, playedMap: livePlayedMap };

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
  const summaries = liveData.teams
    ? liveData.teams.map((team) => ({
        ...team,
        ...computeTeamScores(team.roster, liveData.mapPool),
      }))
    : null;
  // For the win-probability cards, stand in for not-yet-loaded players so the %
  // settles believably instead of spiking while one team is half-empty. Equal to
  // `summaries` once everything is loaded.
  const winSummaries = liveData.teams
    ? estimateWinSummaries(liveData.teams, liveData.mapPool)
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
              data={liveData}
              summaries={summaries}
              winSummaries={winSummaries}
              phase={phase}
              cardPhase={cardPhase}
              selfUserId={selfUserId}
              isDragging={isDragging}
            />
          ) : (
            <StageTwo
              isDragging={isDragging}
              data={liveData}
              summaries={summaries}
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
