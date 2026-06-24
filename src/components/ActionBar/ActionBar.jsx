import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { winRgb } from "../../colors";
import { getFlagSvg } from "../../flags";
import iconUrl from "../../assets/icon-128.png";
import "./ActionBar.css";

// Per-mode copy + colour. The three automations share this one shell; only the
// title, accent, and the action verb differ (see the design handoff in
// "Faceit Auto Actions.dc.html").
const MODES = {
  accept: {
    title: "Auto-accept",
    accent: [51, 196, 109],
    statusLabel: "Accepting this match",
    actionText: "Accept now",
  },
  banmap: {
    title: "Auto-ban map",
    accent: [239, 83, 64],
    statusLabel: "Banning this map",
    actionText: "Ban now",
  },
  banserver: {
    title: "Auto-ban server",
    accent: [239, 83, 64],
    statusLabel: "Banning this server",
    actionText: "Ban now",
  },
};

// Hold the terminal state on screen before sliding out (ms). An auto-fire lingers
// longest (the user wants to see what happened); a deliberate skip/cancel less so.
const HOLD = { auto: 1300, skip: 850, cancel: 950 };
const EXIT_MS = 520;

const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

// The subject preview box: a pulsing check (accept), a map thumbnail (banmap),
// or a country flag (banserver). Falls back to a striped box with the raw code
// when a flag SVG is missing.
function Subject({ kind, thumb, flagCode, accent }) {
  if (kind === "icon") {
    return (
      <span className="fvh-ab-subj fvh-ab-subj-icon" style={{ background: rgba(accent, 0.13) }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M5 12.5l4.2 4.2L19 7" stroke={rgb(accent)} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  if (kind === "map") {
    return (
      <span
        className="fvh-ab-subj fvh-ab-subj-map"
        style={thumb ? { backgroundImage: `url('${thumb}')` } : undefined}
      />
    );
  }
  // server flag
  const svg = getFlagSvg(flagCode);
  if (svg) {
    return (
      <span
        className="fvh-ab-subj fvh-ab-subj-flag"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    );
  }
  return (
    <span className="fvh-ab-subj fvh-ab-subj-code">
      <span>{flagCode || "?"}</span>
    </span>
  );
}

// Presentational + animation shell for all three automations. Timing/detection
// live in the feature components (AutoAccept / AutoVeto); this owns the look,
// the entrance/exit motion, and the counting → done / cancelled phases.
//
// Props:
//   mode      — 'accept' | 'banmap' | 'banserver'
//   status    — 'counting' | 'done' | 'cancelled'
//   reason    — how it ended: 'auto' | 'skip' | 'cancel' (drives hold + exit motion)
//   remaining — seconds left (number); total — configured countdown seconds
//   subject   — { kind, name, thumb?, flagCode?, statPct?, doneTitle }
//   onAct     — the far-left "act now" shortcut (skip the wait)
//   onCancel  — the far-right Cancel (always safe)
//   onExited  — called once the exit animation finishes (parent unmounts)
export default function ActionBar({
  mode,
  status,
  reason,
  remaining,
  total,
  subject,
  onAct,
  onCancel,
  onExited,
}) {
  const cfg = MODES[mode];
  const accent = cfg.accent;
  const [mounted, setMounted] = useState(false);
  const [exiting, setExiting] = useState(false);
  const exitedRef = useRef(false);

  // Entrance: paint offset for a frame, then settle in.
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 30);
    return () => clearTimeout(t);
  }, []);

  // Exit: hold the terminal state, then slide out and tell the parent.
  useEffect(() => {
    if (status === "counting") return;
    const hold = HOLD[reason] ?? HOLD.auto;
    const t1 = setTimeout(() => setExiting(true), hold);
    const t2 = setTimeout(() => {
      if (exitedRef.current) return;
      exitedRef.current = true;
      onExited?.();
    }, hold + EXIT_MS);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  let transform = "translateY(0)";
  let opacity = 1;
  if (exiting) {
    if (reason === "cancel") {
      transform = "translateY(34%) scale(.95)";
    } else {
      transform = "translateY(155%)";
    }
    opacity = 0;
  } else if (!mounted) {
    transform = "translateY(155%)";
    opacity = 0;
  }

  const frac = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;

  // Win-probability chip, coloured on the same red→amber→green ramp the Veto
  // Helper uses, so the two surfaces read as one system.
  let statChip = null;
  if (typeof subject.statPct === "number") {
    const c = winRgb((subject.statPct - 15) / 45);
    statChip = (
      <span
        className="fvh-ab-stat"
        style={{ color: rgb(c), background: rgba(c, 0.14), borderColor: rgba(c, 0.4) }}
      >
        {Math.round(subject.statPct)}%
      </span>
    );
  }

  const rootStyle = {
    "--ab-accent": rgb(accent),
    "--ab-glow": rgba(accent, 0.14),
    "--ab-border": rgba(accent, 0.32),
  };

  return createPortal(
    <div className="fvh-ab-wrap" style={rootStyle}>
      <div className="fvh-ab-card" style={{ transform, opacity }}>
        {/* header: icon + mode + live status */}
        <div className="fvh-ab-head">
          <img className="fvh-ab-logo" src={iconUrl} alt="" />
          <span className="fvh-ab-title">{cfg.title}</span>
          <span className="fvh-ab-status">{cfg.statusLabel}</span>
        </div>

        {/* single compact body row */}
        <div className="fvh-ab-body">
          {status === "counting" && (
            <>
              <button
                type="button"
                className="fvh-ab-act"
                title={`${cfg.actionText} — skips the wait`}
                onClick={onAct}
              >
                {cfg.actionText}
              </button>
              <span className="fvh-ab-divider" />
            </>
          )}

          <Subject
            kind={subject.kind}
            thumb={subject.thumb}
            flagCode={subject.flagCode}
            accent={accent}
          />

          <div className="fvh-ab-name-wrap">
            <div className="fvh-ab-name">{subject.name}</div>
            {subject.sub && (
              <div className="fvh-ab-sub">
                <span className="fvh-ab-sub-text">{subject.sub}</span>
                {statChip}
              </div>
            )}
          </div>

          {status === "counting" && (
            <span className="fvh-ab-secs">
              <span className="fvh-ab-secs-num">{Math.ceil(remaining)}</span>
              <span className="fvh-ab-secs-unit">s</span>
            </span>
          )}

          {status === "counting" && (
            <button type="button" className="fvh-ab-cancel" onClick={onCancel}>
              Cancel
            </button>
          )}
          {status === "done" && (
            <span className="fvh-ab-done">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <path d="M5 12.5l4.2 4.2L19 7" stroke={rgb(accent)} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span style={{ color: rgb(accent) }}>{subject.doneTitle}</span>
            </span>
          )}
          {status === "cancelled" && (
            <span className="fvh-ab-cancelled">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                <path d="M6 6l12 12M18 6L6 18" stroke="#8b8f99" strokeWidth="2.6" strokeLinecap="round" />
              </svg>
              <span>Cancelled</span>
            </span>
          )}
        </div>

        {/* draining time strip */}
        <div className="fvh-ab-strip">
          <div className="fvh-ab-strip-fill" style={{ width: `${Math.round(frac * 100)}%` }} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
