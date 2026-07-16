import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import PositionCallerEditor from "./PositionCallerEditor";
import useSpotCaller from "./useSpotCaller";
import { findTeamChatHeaderLabel } from "./teamChat";
import { subscribeSettings } from "../settings";

// Keeps a small mount node parked beside the matchroom "Team chat" header so we
// can portal the cog button into it. FACEIT owns that header and may re-render it,
// so a MutationObserver re-appends our node if it's wiped (same resilience the
// roster-card mount uses). Returns the current mount element (or null when the
// team chat isn't on screen — e.g. a non-participant, or a non-matchroom page).
function useCogMount() {
  const [mount, setMount] = useState(null);
  const elRef = useRef(null);

  useEffect(() => {
    let raf = null;
    const ensure = () => {
      const label = findTeamChatHeaderLabel();
      const el = elRef.current;
      if (!label) {
        if (el) {
          el.remove();
          elRef.current = null;
          setMount(null);
        }
        return;
      }
      if (el && el.isConnected && label.parentElement?.contains(el)) return;
      if (el) el.remove();
      const next = document.createElement("span");
      next.className = "fvh-spot-cog-mount";
      next.style.cssText =
        "display:inline-flex;align-items:center;margin-left:6px;vertical-align:middle;";
      label.insertAdjacentElement("afterend", next);
      elRef.current = next;
      setMount(next);
    };

    ensure();
    const obs = new MutationObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(ensure);
    });
    obs.observe(document.body, { childList: true, subtree: true });
    return () => {
      obs.disconnect();
      cancelAnimationFrame(raf);
      if (elRef.current) elRef.current.remove();
      elRef.current = null;
    };
  }, []);

  return mount;
}

// The subtle gear (design buildCog): transparent, brightens to FACEIT orange on
// hover; opens the editor directly (never the control panel).
function Cog({ onOpen }) {
  const [hover, setHover] = useState(false);
  const active = hover;
  return (
    <button
      className="fvh-spot-cog"
      title="Set Position Caller map calls"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onOpen}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: 26,
        height: 26,
        borderRadius: 7,
        border: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        padding: 0,
        background: active ? "rgba(255,85,0,.16)" : "rgba(255,255,255,.05)",
        transition: "background .15s",
      }}
    >
      <svg
        width={16}
        height={16}
        viewBox="0 0 24 24"
        fill="none"
        stroke={active ? "#ff5500" : "#c8cad0"}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ transition: "stroke .15s" }}
      >
        <circle cx={12} cy={12} r={3.2} />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    </button>
  );
}

// The Position Caller feature: the matchroom cog entry point, the editor modal it
// opens (also opened from the control panel via a storage ping), and the
// detection/auto-send controller. Always mounted so map calls can be edited even
// when the master toggle is off; the controller itself no-ops unless enabled.
export default function PositionCaller({ matchId, data, selfUserId, settings }) {
  const [editorOpen, setEditorOpen] = useState(false);
  const cogMount = useCogMount();

  useSpotCaller(matchId, data, selfUserId, settings);

  // Control-panel "Set map calls" → storage ping → open here, on the focused tab.
  // FACEIT force-loads the room into every tab, so only the VISIBLE tab responds
  // (else every background tab would pop the editor). A short visibility fallback
  // covers the popup's focus-then-ping ordering race.
  useEffect(() => {
    let pendingTs = 0;
    const onVis = () => {
      if (
        document.visibilityState === "visible" &&
        pendingTs &&
        Date.now() - pendingTs < 4000
      ) {
        pendingTs = 0;
        setEditorOpen(true);
      }
    };
    const unsub = subscribeSettings((changes) => {
      if (!changes.spotEditorPing) return;
      if (document.visibilityState === "visible") setEditorOpen(true);
      else pendingTs = changes.spotEditorPing.newValue || Date.now();
    });
    document.addEventListener("visibilitychange", onVis);
    return () => {
      unsub();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <>
      {/* The cog always shows in a matchroom (even while the feature is off) — it
          IS the primary way users discover the feature. Clicking it opens the
          editor; the auto-send controller stays gated on the master toggle. */}
      {cogMount &&
        createPortal(<Cog onOpen={() => setEditorOpen(true)} />, cogMount)}
      {editorOpen && (
        <PositionCallerEditor onClose={() => setEditorOpen(false)} />
      )}
    </>
  );
}
