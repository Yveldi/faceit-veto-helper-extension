import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import useMatchDetector from "../../hooks/useMatchDetector";
import "./AutoAccept.css";

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

// Counts down while a "Match ready" dialog is open, then clicks accept. A
// Cancel button stops it. (Map-based cancel was removed: FACEIT no longer
// exposes the map before you accept.)
export default function AutoAccept({ enabled, delay }) {
  const dialog = useMatchDetector();
  const [remaining, setRemaining] = useState(null);
  const timerRef = useRef(null);
  const doneRef = useRef(false);
  const sawButtonRef = useRef(false);

  useEffect(() => {
    if (!dialog || !enabled) {
      setRemaining(null);
      return;
    }
    doneRef.current = false;
    sawButtonRef.current = false;
    const startTime = Date.now();

    const finish = () => {
      doneRef.current = true;
      clearInterval(timerRef.current);
    };

    const tick = () => {
      if (doneRef.current) return;

      // Once the accept button is gone after having been present, the match was
      // accepted (manually or by us) or the dialog moved past the accept step.
      // Stop and hide — the dialog can linger in a "waiting for others" state.
      const acceptBtn = findAcceptButton(dialog);
      if (acceptBtn) sawButtonRef.current = true;
      else if (sawButtonRef.current) {
        finish();
        setRemaining(null);
        return;
      }

      const elapsed = (Date.now() - startTime) / 1000;
      if (elapsed >= delay) {
        finish();
        setRemaining(null);
        acceptBtn?.click();
      } else {
        setRemaining(Math.max(0, Math.ceil(delay - elapsed)));
      }
    };

    tick();
    timerRef.current = setInterval(tick, 250);
    return () => clearInterval(timerRef.current);
  }, [dialog, enabled, delay]);

  const cancel = () => {
    doneRef.current = true;
    clearInterval(timerRef.current);
    setRemaining(null);
  };

  if (remaining === null) return null;

  return createPortal(
    <div className="fvh-autoaccept">
      <span className="fvh-autoaccept-count">
        Auto accept in: <b>{remaining}s</b>
      </span>
      <button type="button" onClick={cancel}>
        Cancel
      </button>
    </div>,
    document.body,
  );
}
