import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { prettifyMapName } from "../../utils";
import "./AutoAccept.css";

const MAP_WAIT_TIMEOUT = 15; // seconds to wait for the map before giving up

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

// Counts down while a "Match ready" dialog is open, then clicks accept.
//
// When the user has blocked maps, the behaviour changes: we never accept before
// we know the match's map. Once it's known, if it's a single blocked map we
// cancel; otherwise we accept (respecting the delay). If the map is still
// unknown after MAP_WAIT_TIMEOUT we accept anyway — but only if it never
// resolved to a blocked map (a blocked map cancels for good).
export default function AutoAccept({ dialog, maps, enabled, delay, blockedMaps }) {
  const [display, setDisplay] = useState(null);
  const timerRef = useRef(null);
  const doneRef = useRef(false);
  // Read latest maps/blockedMaps inside the interval without restarting it.
  const mapsRef = useRef(maps);
  const blockedRef = useRef(blockedMaps);
  mapsRef.current = maps;
  blockedRef.current = blockedMaps;

  useEffect(() => {
    if (!dialog || !enabled) {
      setDisplay(null);
      return;
    }
    doneRef.current = false;
    const startTime = Date.now();

    const finish = () => {
      doneRef.current = true;
      clearInterval(timerRef.current);
    };
    const accept = () => {
      finish();
      setDisplay(null);
      findAcceptButton(dialog)?.click();
    };

    const tick = () => {
      if (doneRef.current) return;
      const elapsed = (Date.now() - startTime) / 1000;
      const remaining = Math.max(0, Math.ceil(delay - elapsed));
      const blocked = blockedRef.current ?? [];
      const featureOn = blocked.length > 0;
      const detected = mapsRef.current;
      const mapKnown = Array.isArray(detected) && detected.length > 0;

      if (!featureOn) {
        if (elapsed >= delay) accept();
        else setDisplay({ text: `Auto accept in: ${remaining}s`, cancelable: true });
        return;
      }

      // A single decided map that's on the block list cancels for good.
      if (mapKnown && detected.length === 1 && blocked.includes(detected[0])) {
        finish();
        setDisplay({
          text: `Auto-accept cancelled: ${prettifyMapName(detected[0])}`,
          cancelable: false,
        });
        return;
      }
      if (mapKnown && elapsed >= delay) return accept();
      if (!mapKnown && elapsed >= MAP_WAIT_TIMEOUT) return accept();

      if (!mapKnown && elapsed >= delay) {
        setDisplay({ text: "Waiting for map…", cancelable: true });
      } else {
        setDisplay({ text: `Auto accept in: ${remaining}s`, cancelable: true });
      }
    };

    tick();
    timerRef.current = setInterval(tick, 250);
    return () => clearInterval(timerRef.current);
  }, [dialog, enabled, delay]);

  const cancel = () => {
    doneRef.current = true;
    clearInterval(timerRef.current);
    setDisplay(null);
  };

  if (!display) return null;

  return createPortal(
    <div className="fvh-autoaccept">
      <span className="fvh-autoaccept-count">{display.text}</span>
      {display.cancelable && (
        <button type="button" onClick={cancel}>
          Cancel
        </button>
      )}
    </div>,
    document.body,
  );
}
