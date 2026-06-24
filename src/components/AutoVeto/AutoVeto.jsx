import { useEffect, useMemo, useRef, useState } from "react";
import useVetoTurn from "../../hooks/useVetoTurn";
import { loadSelfMapStats } from "../../settings";
import { computeWinValues, chooseBan } from "../../autoVeto";
import { defaultMapThumbnail, prettifyMapName } from "../../utils";
import serverPool from "../../serverPool.json";
import ActionBar from "../ActionBar/ActionBar";

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

const serverCode = (name) =>
  serverPool.find((s) => s.name.toLowerCase() === name.toLowerCase())?.code;

// Build the ActionBar subject for the chosen ban (map thumbnail + win % or a
// server flag).
function banSubject(target, data, winValues) {
  if (target.phase === "server") {
    return {
      kind: "flag",
      name: target.name,
      flagCode: serverCode(target.name),
      doneTitle: `${target.name} banned`,
    };
  }
  const thumb = data.mapThumbnails?.[target.id] ?? defaultMapThumbnail[target.id];
  return {
    kind: "map",
    name: prettifyMapName(target.name),
    thumb,
    sub: "Win probability",
    statPct: winValues[target.id],
    doneTitle: `${prettifyMapName(target.name)} banned`,
  };
}

// Auto-bans servers and maps when it is our turn (we are the captain). Off by
// default and only rendered when enabled. Shows the shared ActionBar countdown
// per ban (mode "banmap"/"banserver"); the far-left "Ban now" skips the wait and
// Cancel stops all remaining auto-bans for the rest of the match. Decision logic
// is in autoVeto.js; detection is in useVetoTurn. The actual ban is a `.click()`
// on FACEIT's Ban button (same approach as auto-accept).
export default function AutoVeto({ matchId, data, settings }) {
  const turn = useVetoTurn();
  const [selfStats, setSelfStats] = useState(null);
  const [phase, setPhase] = useState(null); // null | counting | done | cancelled
  const [remaining, setRemaining] = useState(0);
  const [target, setTarget] = useState(null); // { name, phase, id }
  const reasonRef = useRef("auto");
  const timerRef = useRef(null);
  const cancelledRef = useRef(null); // matchId the user cancelled
  const actedSigRef = useRef(null); // turn signature we already clicked
  const turnRef = useRef(turn); // latest turn, read inside the effect
  turnRef.current = turn;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => {
    loadSelfMapStats().then(setSelfStats);
  }, []);

  // A new match clears the cancel flag, the acted guard, and any live bar.
  useEffect(() => {
    cancelledRef.current = null;
    actedSigRef.current = null;
    clearInterval(timerRef.current);
    setPhase(null);
    setTarget(null);
  }, [matchId]);

  // Stable win-value lookup: only recomputes when the underlying data changes,
  // not on every App re-render (data is a fresh object each render).
  const winValues = useMemo(
    () => computeWinValues(data, selfStats),
    [data.teams, data.mapPool, data.mainTeamIndex, data.ready, selfStats],
  );

  // A signature that changes when the turn meaningfully changes (phase or the
  // set of bannable options), so the countdown restarts for each new ban.
  const sig = turn.isOurTurn
    ? `${turn.phase}|${turn.options.map((o) => o.name).join(",")}`
    : null;

  useEffect(() => {
    const turn = turnRef.current;
    const actionable =
      turn.isOurTurn &&
      !(turn.phase === "server" && !settings.autoVetoServers) &&
      cancelledRef.current !== matchId &&
      actedSigRef.current !== sig;

    if (!actionable) {
      // Drop a stale countdown if the turn moved on; never disturb a terminal
      // (done/cancelled) bar mid-animation.
      if (phaseRef.current === "counting") {
        clearInterval(timerRef.current);
        setPhase(null);
        setTarget(null);
      }
      return;
    }

    const choice = chooseBan(turn, {
      winValues,
      mapFirst: settings.autoVetoMapFirst,
      mapDynamic: settings.autoVetoMapDynamic,
      mapLast: settings.autoVetoMapLast,
      serverOrder: settings.autoVetoServerOrder,
      worstFirstEnabled: settings.autoVetoWorstFirstEnabled,
      worstFirstGap: settings.autoVetoWorstFirstGap,
      protectEnabled: settings.autoVetoProtectFloorEnabled,
      protectGap: settings.autoVetoProtectFloor,
    });
    if (!choice) return;

    clearInterval(timerRef.current);
    setTarget({ name: choice.name, phase: turn.phase, id: choice.id });
    reasonRef.current = "auto";
    setPhase("counting");
    const delay = settings.autoVetoDelay;
    const start = Date.now();
    setRemaining(delay);

    const tick = () => {
      const elapsed = (Date.now() - start) / 1000;
      if (elapsed >= delay) {
        clearInterval(timerRef.current);
        actedSigRef.current = sig;
        reasonRef.current = "auto";
        // Re-find the button live (avoids any stale reference) and click it.
        findBanButton(choice.name)?.click();
        setPhase("done");
      } else {
        setRemaining(Math.max(0, delay - elapsed));
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
    reasonRef.current = "cancel";
    setPhase("cancelled");
  };

  const actNow = () => {
    clearInterval(timerRef.current);
    actedSigRef.current = sig;
    reasonRef.current = "skip";
    findBanButton(target?.name)?.click();
    setPhase("done");
  };

  if (phase === null || !target) return null;

  return (
    <ActionBar
      mode={target.phase === "server" ? "banserver" : "banmap"}
      status={phase}
      reason={reasonRef.current}
      remaining={remaining}
      total={settings.autoVetoDelay}
      subject={banSubject(target, data, winValues)}
      onAct={actNow}
      onCancel={cancel}
      onExited={() => {
        setPhase(null);
        setTarget(null);
      }}
    />
  );
}
