import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import "./PositionCallerEditor.css";
import iconUrl from "../assets/icon-128.png";
import { defaultMapThumbnail, prettifyMapName } from "../utils";
import {
  SPOT_MAP_IDS,
  loadSpotCalls,
  saveSpotCalls,
  loadSettings,
  updateSettings,
  subscribeSettings,
  spotCallsDefaults,
} from "../settings";

// The Position Caller editor — the finalized "3c / Frosted lock" panel. Ported
// from the design (Spot Caller In Context.dc.html buildEditor); pixel, colour and
// motion values are intentional. Reads/writes the SAME storage the control panel
// does (the `spotDuo` toggle + the per-map `spotCalls`), so the two surfaces are
// one source of truth. Rendered as a centred modal portaled to document.body.
// (The design's per-trigger chips were dropped — the feature always fires at
// map-lock; there's no lobby-vs-veto choice.)

const DUOC = "#57cbe0";
const CAP = 160; // soft cap; maxLength a little higher so users see they're over
const ROWH = 36;
const HEADH = 26;

// --- small presentational primitives ---------------------------------------

function Switch({ on, onClick, scale = 1, color = "#ff6a1f", dur = ".15s" }) {
  const s = scale;
  return (
    <button
      onClick={onClick}
      style={{
        width: 34 * s,
        height: 19 * s,
        flex: "none",
        borderRadius: 11,
        border: "none",
        cursor: "pointer",
        padding: 2,
        background: on ? color : "#33363f",
        transition: `background ${dur}`,
        boxShadow: on ? `0 0 10px ${color}66` : "none",
      }}
    >
      <span
        style={{
          display: "block",
          width: 15 * s,
          height: 15 * s,
          borderRadius: "50%",
          background: "#fff",
          transform: on ? `translateX(${15 * s}px)` : "translateX(0)",
          transition: `transform ${dur}`,
          boxShadow: "0 1px 2px rgba(0,0,0,.4)",
        }}
      />
    </button>
  );
}

function Thumb({ id, w, h, radius }) {
  const src = defaultMapThumbnail[id];
  return (
    <div
      style={{
        width: w,
        height: h,
        flex: "none",
        borderRadius: radius,
        overflow: "hidden",
        position: "relative",
        backgroundImage: src ? `url('${src}')` : undefined,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundColor: "#23262e",
      }}
    >
      <span
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(180deg,rgba(0,0,0,.15),rgba(0,0,0,.55))",
        }}
      />
    </div>
  );
}

function HCell({ w, flex, children, color }) {
  return (
    <span
      style={{
        width: w ?? undefined,
        flex: flex ? 1 : "none",
        fontSize: "8px",
        fontWeight: 800,
        letterSpacing: ".08em",
        color: color || "#75797f",
      }}
    >
      {children}
    </span>
  );
}

const OFF_BOX = {
  background: "#101115",
  border: "1px solid rgba(255,255,255,.07)",
  filter: "blur(2px)",
  pointerEvents: "none",
  transition: "filter .3s ease",
};

function CallInput({ value, disabled, accent, placeholder, onChange, off }) {
  return (
    <input
      className="fvh-spot-input"
      type="text"
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      maxLength={CAP + 40}
      onChange={onChange}
      style={{
        flex: 1,
        minWidth: 0,
        background: disabled ? "transparent" : "#101115",
        border:
          "1px solid " +
          (disabled
            ? "transparent"
            : accent
              ? "rgba(87,203,224,.24)"
              : "rgba(255,255,255,.08)"),
        borderRadius: 6,
        color: disabled ? "#565a63" : "#e8e9ec",
        fontSize: "10.5px",
        padding: "6px 8px",
        outline: "none",
        transition:
          "border-color .4s ease, color .4s ease, background-color .4s ease",
        ...(off || {}),
      }}
    />
  );
}

// --- editor ----------------------------------------------------------------

export default function PositionCallerEditor({ onClose }) {
  const [cfg, setCfg] = useState(null); // per-map { on, msg, duoMsg }
  const [duo, setDuoState] = useState(false);
  const [spot, setSpotState] = useState(true); // Position Caller master (spotEnabled)

  // Load current storage state, and keep the duo switch + the feature master
  // live in sync with the control panel (both write the same keys).
  useEffect(() => {
    let alive = true;
    loadSpotCalls().then((c) => alive && setCfg(c));
    loadSettings().then((s) => {
      if (!alive) return;
      setDuoState(s.spotDuo);
      setSpotState(s.spotEnabled);
    });
    const unsub = subscribeSettings((changes) => {
      if ("spotDuo" in changes) setDuoState(changes.spotDuo.newValue);
      if ("spotEnabled" in changes) setSpotState(changes.spotEnabled.newValue);
    });
    return () => {
      alive = false;
      unsub();
    };
  }, []);

  const setField = (code, field, value) => {
    setCfg((prev) => {
      const base = prev || spotCallsDefaults();
      const next = { ...base, [code]: { ...base[code], [field]: value } };
      saveSpotCalls(next);
      return next;
    });
  };
  const toggleMap = (code) => setField(code, "on", !(cfg?.[code]?.on ?? true));
  const setDuo = (v) => {
    const next = v === undefined ? !duo : v;
    setDuoState(next);
    updateSettings({ spotDuo: next });
  };
  // Toggle the whole feature from inside the editor (the footer button). Writes
  // the same `spotEnabled` key the control panel's master toggle does.
  const setSpot = (v) => {
    const next = v === undefined ? !spot : v;
    setSpotState(next);
    updateSettings({ spotEnabled: next });
  };

  const calls = cfg || spotCallsDefaults();

  const leftHead = (
    <div
      style={{
        height: HEADH,
        display: "flex",
        alignItems: "flex-end",
        paddingBottom: 6,
        borderBottom: "1px solid rgba(255,255,255,.08)",
      }}
    >
      <HCell w={84}>MAP</HCell>
      <HCell w={30}>ON</HCell>
      <HCell flex>SOLO MESSAGE</HCell>
    </div>
  );

  const leftRows = SPOT_MAP_IDS.map((code, i) => {
    const c = calls[code];
    return (
      <div
        key={code}
        style={{
          display: "flex",
          alignItems: "center",
          height: ROWH,
          borderBottom:
            i < SPOT_MAP_IDS.length - 1 ? "1px solid rgba(255,255,255,.05)" : "none",
          opacity: c.on ? 1 : 0.7,
        }}
      >
        <span
          style={{
            width: 84,
            flex: "none",
            display: "flex",
            alignItems: "center",
            gap: 7,
          }}
        >
          <Thumb id={code} w={22} h={17} radius={5} />
          <span
            style={{
              fontSize: "11px",
              fontWeight: 700,
              color: "#e8e9ec",
              whiteSpace: "nowrap",
            }}
          >
            {prettifyMapName(code)}
          </span>
        </span>
        <span style={{ width: 30, flex: "none" }}>
          <Switch on={c.on} onClick={() => toggleMap(code)} scale={0.72} />
        </span>
        <CallInput
          value={c.msg}
          disabled={!c.on}
          placeholder={"Solo call…"}
          onChange={(e) => setField(code, "msg", e.target.value)}
          off={c.on ? null : OFF_BOX}
        />
      </div>
    );
  });

  const rightHead = (
    <div
      style={{
        height: HEADH,
        display: "flex",
        alignItems: "flex-end",
        paddingBottom: 6,
        borderBottom:
          "1px solid " + (duo ? "rgba(87,203,224,.25)" : "rgba(255,255,255,.08)"),
        transition: "border-color .3s",
      }}
    >
      <span
        style={{
          fontSize: "8px",
          fontWeight: 800,
          letterSpacing: ".08em",
          color: duo ? DUOC : "#565a63",
          transition: "color .3s",
        }}
      >
        DUO MESSAGE
      </span>
      <span style={{ marginLeft: "auto" }}>
        <Switch on={duo} onClick={() => setDuo()} scale={0.66} color={DUOC} dur=".2s" />
      </span>
    </div>
  );

  const rightRows = SPOT_MAP_IDS.map((code, i) => {
    const c = calls[code];
    return (
      <div
        key={code}
        style={{
          display: "flex",
          alignItems: "center",
          height: ROWH,
          borderBottom:
            i < SPOT_MAP_IDS.length - 1 ? "1px solid rgba(255,255,255,.05)" : "none",
          opacity: c.on ? 1 : 0.7,
        }}
      >
        <CallInput
          value={c.duoMsg}
          disabled={!c.on}
          accent={duo}
          placeholder="Duo call (blank = use solo)"
          onChange={(e) => setField(code, "duoMsg", e.target.value)}
          off={c.on ? null : OFF_BOX}
        />
      </div>
    );
  });

  const fade =
    "radial-gradient(160% 145% at 50% 50%, #000 78%, transparent 100%), linear-gradient(to right, #000 96%, transparent 100%)";
  const frost = (
    <div
      onClick={() => setDuo(true)}
      title="Enable duo calls"
      style={{
        position: "absolute",
        inset: "0 -16px 0 -4px",
        background: "rgba(19,20,24,.36)",
        backdropFilter: "blur(3px)",
        WebkitBackdropFilter: "blur(3px)",
        maskImage: fade,
        WebkitMaskImage: fade,
        maskComposite: "intersect",
        WebkitMaskComposite: "source-in",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 5,
        padding: "0 30px 12px 20px",
        textAlign: "center",
        textShadow:
          "0 1px 2px rgba(0,0,0,.98), 0 2px 9px rgba(0,0,0,.92), 0 0 20px rgba(6,8,12,.95)",
        userSelect: "none",
        WebkitUserSelect: "none",
        opacity: duo ? 0 : 1,
        pointerEvents: duo ? "none" : "auto",
        cursor: "pointer",
        transition: "opacity .4s ease",
      }}
    >
      <span style={{ fontSize: "11.5px", fontWeight: 800, color: "#eef0f3" }}>
        Duo messages are off
      </span>
      <span
        style={{
          fontSize: "9.5px",
          fontWeight: 600,
          color: "#b6bcc6",
          lineHeight: 1.5,
          maxWidth: 240,
        }}
      >
        Send a different call to team chat when you queue with a duo.
      </span>
      <span
        style={{
          fontSize: "9.5px",
          fontWeight: 600,
          color: "#b6bcc6",
          lineHeight: 1.5,
          maxWidth: 240,
        }}
      >
        In a trio it falls back to the solo call, and in a 4 or 5 stack nothing is
        sent.
      </span>
      <span
        style={{ fontSize: "9.5px", fontWeight: 800, color: DUOC, marginTop: 1 }}
      >
        Click to enable
      </span>
    </div>
  );

  // Footer — enable/disable the whole feature from inside the editor. Stays live
  // even while the body above is dimmed/frosted (disabled), so it can turn the
  // feature back on. Green dot + "on" copy when enabled; red dot + "off" copy and
  // an orange "Enable feature" button when disabled.
  const footer = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        borderTop: "1px solid rgba(255,255,255,.08)",
        background: "rgba(255,255,255,.02)",
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          flex: "none",
          borderRadius: "50%",
          background: spot ? "#37d07a" : "#ff7a7a",
          boxShadow: spot ? "0 0 8px rgba(55,208,122,.6)" : "none",
        }}
      />
      <span
        style={{
          display: "flex",
          flexDirection: "column",
          lineHeight: 1.3,
          flex: 1,
          minWidth: 0,
        }}
      >
        <span
          style={{
            fontSize: "11px",
            fontWeight: 800,
            color: spot ? "#e8e9ec" : "#9aa0ab",
          }}
        >
          {spot ? "Position Caller is on" : "Position Caller is off"}
        </span>
        <span style={{ fontSize: "9px", fontWeight: 600, color: "#75797f" }}>
          {spot
            ? "Your calls are sent to team chat automatically, unless it is a tournament match."
            : "No calls will be sent to team chat."}
        </span>
      </span>
      <button
        onClick={() => setSpot()}
        style={{
          flex: "none",
          padding: "7px 14px",
          borderRadius: 7,
          fontSize: "10.5px",
          fontWeight: 800,
          cursor: "pointer",
          transition: "background .15s, border-color .15s, color .15s",
          border: spot
            ? "1px solid rgba(255,255,255,.14)"
            : "1px solid rgba(255,106,31,.5)",
          background: spot ? "transparent" : "#ff6a1f",
          color: spot ? "#c7ccd4" : "#12131a",
        }}
        onMouseEnter={(e) => {
          if (spot) {
            e.currentTarget.style.borderColor = "rgba(255,122,122,.6)";
            e.currentTarget.style.color = "#ff9a9a";
          }
        }}
        onMouseLeave={(e) => {
          if (spot) {
            e.currentTarget.style.borderColor = "rgba(255,255,255,.14)";
            e.currentTarget.style.color = "#c7ccd4";
          }
        }}
      >
        {spot ? "Disable feature" : "Enable feature"}
      </button>
    </div>
  );

  const panel = (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        width: 620,
        borderRadius: 13,
        overflow: "hidden",
        border: "1px solid rgba(255,106,31,.3)",
        background: "linear-gradient(158deg,#1d1922,#15171d 55%,#121a18)",
        boxShadow: "0 30px 70px rgba(0,0,0,.7)",
        animation: "fvhspotpop .22s ease",
      }}
    >
      <div
        style={{ height: 3, background: "linear-gradient(90deg,#ff6a1f,#ef4d00)" }}
      />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          padding: "9px 12px",
          borderBottom: "1px solid rgba(255,106,31,.16)",
          background:
            "linear-gradient(115deg, rgba(255,106,31,.10), transparent 62%), #191a20",
        }}
      >
        <span
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            background: "rgba(255,85,0,.14)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <img
            src={iconUrl}
            style={{ width: 16, height: 16, borderRadius: 4, display: "block" }}
          />
        </span>
        <span
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            minWidth: 0,
            lineHeight: 1.25,
          }}
        >
          <span style={{ fontSize: "12.5px", fontWeight: 800, color: "#f1f2f4" }}>
            Position Caller
          </span>
          <span style={{ fontSize: "9px", fontWeight: 600, color: "#8b9098" }}>
            Auto-sends your call to team chat when the map locks in
          </span>
        </span>
        <button
          onClick={onClose}
          title="Close"
          style={{
            width: 24,
            height: 24,
            flex: "none",
            borderRadius: 6,
            border: "none",
            background: "rgba(255,255,255,.06)",
            color: "#c7ccd4",
            fontSize: "14px",
            cursor: "pointer",
          }}
        >
          {"✕"}
        </button>
      </div>
      <div style={{ position: "relative" }}>
        <div
          style={{
            padding: 12,
            opacity: spot ? 1 : 0.42,
            filter: spot ? "none" : "grayscale(.55)",
            pointerEvents: spot ? "auto" : "none",
            transition: "opacity .2s ease, filter .2s ease",
          }}
        >
          <div style={{ display: "flex", gap: 12, alignItems: "stretch" }}>
            <div style={{ flex: "1.25", minWidth: 0 }}>
              {leftHead}
              <div>{leftRows}</div>
            </div>
            <div style={{ flex: "1", minWidth: 0 }}>
              {rightHead}
              <div style={{ position: "relative", overflow: "visible" }}>
                <div>{rightRows}</div>
                {frost}
              </div>
            </div>
          </div>
        </div>
        {/* Frosts the whole body when the feature is off (footer stays clear). */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 4,
            background: "rgba(15,16,20,.35)",
            backdropFilter: "blur(3px)",
            WebkitBackdropFilter: "blur(3px)",
            opacity: spot ? 0 : 1,
            pointerEvents: "none",
            transition: "opacity .25s ease",
          }}
        />
      </div>
      {footer}
    </div>
  );

  return createPortal(
    <div
      className="fvh-spot-root"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483000,
        background: "rgba(6,7,10,.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      {panel}
    </div>,
    document.body,
  );
}
