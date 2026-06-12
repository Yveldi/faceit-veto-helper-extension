import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import useMatchDetector from "../../hooks/useMatchDetector";
import "./AutoAccept.css";

// The match-ready dialog's action button is the one that isn't the close (X).
// Targeting it by elimination (not by the text "Accept") keeps it working
// regardless of the user's FACEIT language.
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
// Cancel button stops it. Renders nothing when disabled or no dialog is open.
export default function AutoAccept({ enabled, delay }) {
  const dialog = useMatchDetector();
  const [remaining, setRemaining] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!dialog || !enabled) {
      setRemaining(null);
      return;
    }
    let secs = delay;
    setRemaining(secs);
    timerRef.current = setInterval(() => {
      secs -= 1;
      if (secs <= 0) {
        clearInterval(timerRef.current);
        setRemaining(0);
        console.log("FVH: auto-accepting match");
        findAcceptButton(dialog)?.click();
      } else {
        setRemaining(secs);
      }
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [dialog, enabled, delay]);

  const cancel = () => {
    clearInterval(timerRef.current);
    setRemaining(null);
    console.log("FVH: auto-accept cancelled");
  };

  if (!dialog || !enabled || remaining === null) return null;

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
