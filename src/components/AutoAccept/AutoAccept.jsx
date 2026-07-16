import { useEffect, useRef, useState } from "react";
import useMatchDetector from "../../hooks/useMatchDetector";
import ActionBar from "../ActionBar/ActionBar";

// The match-ready dialog's action button is the one that isn't the close (X).
// Targeting it by elimination (not the text "Accept") keeps it language-safe.
function findAcceptButton(dialog) {
  const buttons = [...dialog.querySelectorAll("button")];
  return (
    buttons.find(
      (b) =>
        b.getAttribute("aria-label") !== "close" && b.textContent.trim() !== "",
    ) ?? null
  );
}

// Counts down while a "Match ready" dialog is open, then clicks accept. The
// shared ActionBar shows the countdown (mode "accept"); Cancel stops it, and the
// far-left "Accept now" skips the wait. (Map-based cancel was removed: FACEIT no
// longer exposes the map before you accept.)
export default function AutoAccept({ enabled, delay, onAccepted }) {
  const dialog = useMatchDetector();
  const [phase, setPhase] = useState(null); // null | counting | done | cancelled
  const [remaining, setRemaining] = useState(0);
  const reasonRef = useRef("auto"); // how it ended, for ActionBar's exit motion
  const timerRef = useRef(null);
  const doneRef = useRef(false);
  const sawButtonRef = useRef(false);

  useEffect(() => {
    if (!dialog || !enabled) {
      clearInterval(timerRef.current);
      setPhase(null);
      return;
    }
    doneRef.current = false;
    sawButtonRef.current = false;
    reasonRef.current = "auto";
    setPhase("counting");
    setRemaining(delay);
    const startTime = Date.now();

    const finish = () => {
      doneRef.current = true;
      clearInterval(timerRef.current);
    };

    const tick = () => {
      if (doneRef.current) return;

      // Once the accept button is gone after having been present, the match was
      // accepted (manually or by us) or the dialog moved past the accept step.
      // Hide — the dialog can linger in a "waiting for others" state.
      const acceptBtn = findAcceptButton(dialog);
      if (acceptBtn) sawButtonRef.current = true;
      else if (sawButtonRef.current) {
        finish();
        setPhase(null);
        return;
      }

      const elapsed = (Date.now() - startTime) / 1000;
      if (elapsed >= delay) {
        finish();
        reasonRef.current = "auto";
        acceptBtn?.click();
        onAccepted?.();
        setPhase("done");
      } else {
        setRemaining(Math.max(0, delay - elapsed));
      }
    };

    tick();
    timerRef.current = setInterval(tick, 250);
    return () => clearInterval(timerRef.current);
  }, [dialog, enabled, delay]);

  const cancel = () => {
    doneRef.current = true;
    clearInterval(timerRef.current);
    reasonRef.current = "cancel";
    setPhase("cancelled");
  };

  const actNow = () => {
    doneRef.current = true;
    clearInterval(timerRef.current);
    reasonRef.current = "skip";
    findAcceptButton(dialog)?.click();
    onAccepted?.();
    setPhase("done");
  };

  if (phase === null) return null;

  return (
    <ActionBar
      mode="accept"
      status={phase}
      reason={reasonRef.current}
      remaining={remaining}
      total={delay}
      subject={{ kind: "icon", name: "Match found", doneTitle: "Match accepted" }}
      onAct={actNow}
      onCancel={cancel}
      onExited={() => setPhase(null)}
    />
  );
}
