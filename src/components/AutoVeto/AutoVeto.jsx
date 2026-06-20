import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import useVetoTurn from "../../hooks/useVetoTurn";
import { loadSelfMapStats } from "../../settings";
import { computeWinValues, chooseBan } from "../../autoVeto";
import "./AutoVeto.css";

// Find the live, enabled Ban button for an option by its displayed name. Done
// fresh at click time so a FACEIT re-render can't leave us with a stale button.
function findBanButton(name) {
  for (const row of document.querySelectorAll('[data-testid="matchPreference"]')) {
    const button = row.querySelector("button");
    if (!button || button.disabled) continue;
    const mid = row.querySelector(".middleSlot");
    if (mid && mid.textContent.trim() === name) return button;
  }
  return null;
}

// Auto-bans servers and maps when it is our turn (we are the captain). Off by
// default and only rendered when enabled. Shows a countdown bar per ban; Cancel
// stops all remaining auto-bans for the rest of the match. Decision logic is in
// autoVeto.js; detection is in useVetoTurn. The actual ban is a `.click()` on
// FACEIT's Ban button (same approach as auto-accept).
export default function AutoVeto({ matchId, data, settings }) {
  const turn = useVetoTurn();
  const [selfStats, setSelfStats] = useState(null);
  const [remaining, setRemaining] = useState(null);
  const [target, setTarget] = useState(null);
  const timerRef = useRef(null);
  const cancelledRef = useRef(null); // matchId the user cancelled
  const actedSigRef = useRef(null); // turn signature we already clicked
  const turnRef = useRef(turn); // latest turn, read inside the effect
  turnRef.current = turn;

  useEffect(() => {
    loadSelfMapStats().then(setSelfStats);
  }, []);

  // A new match clears the cancel flag and the acted guard.
  useEffect(() => {
    cancelledRef.current = null;
    actedSigRef.current = null;
  }, [matchId]);

  // Stable win-value lookup: only recomputes when the underlying data changes,
  // not on every App re-render (data is a fresh object each render).
  const winValues = useMemo(
    () => computeWinValues(data, selfStats),
    [data.teams, data.mapPool, data.mainTeamIndex, selfStats],
  );

  // A signature that changes when the turn meaningfully changes (phase or the
  // set of bannable options), so the countdown restarts for each new ban.
  const sig = turn.isOurTurn
    ? `${turn.phase}|${turn.options.map((o) => o.name).join(",")}`
    : null;

  useEffect(() => {
    clearInterval(timerRef.current);
    setRemaining(null);
    setTarget(null);

    const turn = turnRef.current;
    if (!turn.isOurTurn) return;
    // Server bans are opt-in; without it, only maps are auto-banned.
    if (turn.phase === "server" && !settings.autoVetoServers) return;
    if (cancelledRef.current === matchId) return;
    if (actedSigRef.current === sig) return;

    const choice = chooseBan(turn, {
      winValues,
      mapFirst: settings.autoVetoMapFirst,
      mapDynamic: settings.autoVetoMapDynamic,
      mapLast: settings.autoVetoMapLast,
      serverOrder: settings.autoVetoServerOrder,
      worstFirstEnabled: settings.autoVetoWorstFirstEnabled,
      worstFirstGap: settings.autoVetoWorstFirstGap,
      protectFloorEnabled: settings.autoVetoProtectFloorEnabled,
      protectFloor: settings.autoVetoProtectFloor,
    });
    if (!choice) return;

    setTarget({ name: choice.name, phase: turn.phase });
    const delay = settings.autoVetoDelay;
    const start = Date.now();
    setRemaining(delay);

    const tick = () => {
      const elapsed = (Date.now() - start) / 1000;
      if (elapsed >= delay) {
        clearInterval(timerRef.current);
        actedSigRef.current = sig;
        setRemaining(null);
        // Re-find the button live (avoids any stale reference) and click it.
        findBanButton(choice.name)?.click();
      } else {
        setRemaining(Math.max(0, Math.ceil(delay - elapsed)));
      }
    };

    timerRef.current = setInterval(tick, 250);
    return () => clearInterval(timerRef.current);
    // Keyed on `sig` (a stable per-turn string), not the `turn` object, so the
    // panel's per-second countdown re-render doesn't restart our timer. The
    // latest turn is read from turnRef. settings arrays are stable between
    // popup edits, so they only re-run this when the user changes a preference.
  }, [
    sig,
    matchId,
    winValues,
    settings.autoVetoServers,
    settings.autoVetoDelay,
    settings.autoVetoMapFirst,
    settings.autoVetoMapDynamic,
    settings.autoVetoMapLast,
    settings.autoVetoServerOrder,
    settings.autoVetoWorstFirstEnabled,
    settings.autoVetoWorstFirstGap,
    settings.autoVetoProtectFloorEnabled,
    settings.autoVetoProtectFloor,
  ]);

  const cancel = () => {
    cancelledRef.current = matchId;
    clearInterval(timerRef.current);
    setRemaining(null);
    setTarget(null);
  };

  if (remaining === null || !target) return null;

  return createPortal(
    <div className="fvh-autoveto">
      <span className="fvh-autoveto-count">
        Auto-banning {target.phase} <b>{target.name}</b> in <b>{remaining}s</b>
      </span>
      <button type="button" onClick={cancel}>
        Cancel
      </button>
    </div>,
    document.body,
  );
}
