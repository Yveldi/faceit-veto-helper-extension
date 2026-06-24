import { useEffect, useLayoutEffect, useRef, useState } from "react";
import "./MapWinProbabilities.css";
import Hoverable from "../Tooltip/Hoverable";
import Tooltip from "../Tooltip/Tooltip";
import MapBreakdownPopover from "../Tooltip/MapBreakdownPopover";
import { computeMapWinProbabilities } from "../../stats";
import { winColor, winRgb, mapCode } from "../../colors";
import { prettifyMapName, defaultMapThumbnail } from "../../utils";

// Card height (56) + gap (6); used for the absolute re-sort layout.
const ROW = 62;
// How long a removed card lingers (fading out) before it's dropped. Matches the
// fade-out animation duration in CSS.
const EXIT_MS = 280;

function InitSkeleton({ rows, wide }) {
  return (
    <div className={`fvh-mwp${wide ? " fvh-mwp-wide" : ""}`}>
      <div className="fvh-mwp-loadhead">
        <span>Loading map pool</span>
        <span className="fvh-spinner" />
      </div>
      <div className="fvh-mwp-list" style={{ height: rows * ROW - 6 }}>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="fvh-mwp-skel fvh-cz" style={{ top: i * ROW }}>
            <span className="fvh-mwp-skel-code" />
            <span className="fvh-mwp-skel-name" />
            <span className="fvh-mwp-skel-pct">
              <span className="fvh-sweep" />
            </span>
            <span className="fvh-mwp-skel-bar" />
          </div>
        ))}
      </div>
      <div className="fvh-mwp-loadnote">Connecting to FACEIT · fetching map veto…</div>
    </div>
  );
}

// Per-map win probability for the main team, rendered as thumbnail cards sorted
// worst-first (ban order). Adapts to the loading phase (init/maps/streaming/
// loaded) and to runtime pool changes (the Veto Regret Helper toggle): added
// cards fade in, removed cards fade out in place, and the list height tweens in
// lockstep with the cards re-sorting.
//
// The set of cards on screen is a `displayed` superset of the pool: it grows
// immediately when maps are added and shrinks only after `EXIT_MS`, so a removed
// card keeps rendering (no unmount) and just fades out. Enter/exit are CSS
// ANIMATIONS (not opacity transitions) so they play reliably on class-add, and
// the fade-in only marks genuinely added maps — never the initial mount or a
// stage switch (where `displayed` already equals the pool).
//
// Single-map pool (Premium queue, or Regret Helper off in a one-map lobby) has
// nothing to ban: the lone card gets NO win color and NO BAN/PICK tag. Once the
// match's map is decided, the "now playing" frame (`showPlaying`/`playedMap`)
// marks it wherever it sits in the pool — including the lone card (this replaced
// the old single-map vignette).
export default function MapWinProbabilities({
  mainTeam,
  otherTeam,
  breakdownMain,
  breakdownOther,
  mapPool,
  mapThumbnails,
  playedMap,
  phase,
  hover,
  onMapEnter,
  onMapLeave,
  activeMap,
  bodyStatus,
  wide,
}) {
  const [displayed, setDisplayed] = useState(mapPool);
  const displayedRef = useRef(displayed);
  const prevDisplayedRef = useRef(displayed); // for enter detection (post-paint)
  const removeTimers = useRef({});
  const snapRef = useRef({}); // last descriptor per map (so exits render correctly)
  displayedRef.current = displayed;

  // Reconcile the displayed set with the pool: add new maps now, drop removed
  // ones after they've faded. Runs before paint so the change render already
  // shows the right cards.
  useLayoutEffect(() => {
    const adds = mapPool.filter((m) => !displayedRef.current.includes(m));
    if (adds.length) setDisplayed((d) => [...d, ...adds.filter((m) => !d.includes(m))]);
    for (const m of displayedRef.current) {
      const inPool = mapPool.includes(m);
      if (!inPool && !removeTimers.current[m]) {
        removeTimers.current[m] = setTimeout(() => {
          delete removeTimers.current[m];
          setDisplayed((d) => d.filter((x) => x !== m));
        }, EXIT_MS);
      } else if (inPool && removeTimers.current[m]) {
        clearTimeout(removeTimers.current[m]);
        delete removeTimers.current[m];
      }
    }
  }, [mapPool]);

  useEffect(() => {
    prevDisplayedRef.current = displayed;
  });
  useEffect(
    () => () => Object.values(removeTimers.current).forEach(clearTimeout),
    [],
  );

  if (phase === "init") {
    return <InitSkeleton rows={Math.min(mapPool.length || 5, 7)} wide={wide} />;
  }

  const showVals = phase !== "maps";
  const loaded = phase === "loaded";
  // The hover breakdown is available as soon as real per-map values exist (i.e.
  // from "streaming" on, not just "loaded") — players still arriving show a
  // shimmer row inside the popover, mirroring the Stage 3 matrix.
  const breakdownReady = showVals && breakdownMain && breakdownOther;
  const single = mapPool.length === 1; // nothing to ban → no color/tags
  // The map the match has settled on, highlighted with a "now playing" frame
  // wherever it appears in the displayed pool — for a real veto (frame on the
  // decided card), a Regret-expanded pool, OR a lone single-map card (this frame
  // replaces the old single-map vignette).
  const showPlaying = playedMap && mapPool.includes(playedMap);
  const probabilities = showVals
    ? computeMapWinProbabilities({ mainTeam, otherTeam, mapPool })
    : {};

  const ranked = showVals
    ? [...mapPool].sort((a, b) => probabilities[a] - probabilities[b])
    : [...mapPool];
  const rankOf = {};
  ranked.forEach((m, i) => (rankOf[m] = i));
  const lo = showVals ? probabilities[ranked[0]] : 0;
  const hi = showVals ? probabilities[ranked[ranked.length - 1]] : 0;
  const span = hi - lo || 1;

  const describe = (map) => {
    const pct = probabilities[map];
    const norm = showVals ? (pct - lo) / span : 0;
    const colored = showVals && !single;
    const [r, g, b] = colored ? winRgb(norm) : [0, 0, 0];
    const isPlaying = showPlaying && map === playedMap;
    const desc = {
      map,
      top: rankOf[map] * ROW,
      playing: isPlaying,
      // When SOME other map is the live map, every other card is blurred + dimmed.
      dim: showPlaying && !isPlaying,
      showPct: showVals,
      pct,
      color: colored ? winColor(norm) : "transparent",
      wash: colored
        ? `linear-gradient(90deg, rgba(${r},${g},${b},0) 56%, rgba(${r},${g},${b},.30) 100%)`
        : "none",
      // The win-probability wash is removed from the live card only, so it shows
      // its true thumbnail colour.
      washOp: colored && !isPlaying ? 1 : 0,
      barW: colored ? (pct / (hi || 1)) * 100 : 0,
      thumb: mapThumbnails[map] ?? defaultMapThumbnail[map],
      // BAN/PICK stay computed even on the live card (we crossfade them out via
      // CSS rather than dropping them) — PLAYING just takes visual priority.
      tag:
        loaded && !single
          ? rankOf[map] === 0
            ? { label: "BAN", cls: "ban" }
            : rankOf[map] === ranked.length - 1
              ? { label: "PICK", cls: "pick" }
              : null
          : null,
    };
    snapRef.current[map] = desc;
    return desc;
  };

  // Cards to render: every in-pool map (live), plus any still-lingering removed
  // map (from its snapshot). Newly-shown in-pool maps get the fade-in class.
  const enteringSet = new Set(
    displayed.filter(
      (m) => mapPool.includes(m) && !prevDisplayedRef.current.includes(m),
    ),
  );
  const cards = displayed
    .map((map) => {
      const inPool = mapPool.includes(map);
      const d = inPool ? describe(map) : snapRef.current[map];
      if (!d) return null;
      return { d, exit: !inPool, enter: enteringSet.has(map) };
    })
    .filter(Boolean);

  const renderCard = ({ d, exit, enter }) => {
    const card = (
      <div
        className={`fvh-mwp-card${!exit && activeMap === d.map ? " active" : ""}${
          d.dim ? " dim" : ""
        }${d.playing ? " playing" : ""}`}
        onPointerEnter={!exit && onMapEnter ? () => onMapEnter(d.map) : undefined}
        onPointerLeave={!exit && onMapLeave ? () => onMapLeave() : undefined}
      >
        {/* Thumbnail is its own layer so it can be blurred (when another map is
            live) without blurring the text/chips on top of it. */}
        <span
          className="fvh-mwp-thumb"
          style={{ backgroundImage: d.thumb ? `url('${d.thumb}')` : undefined }}
        />
        <span className="fvh-mwp-shade" />
        <span
          className="fvh-mwp-tint"
          style={{ background: d.wash, opacity: d.washOp }}
        />
        {/* Masked white frame on the live map (3 sides, fading out before the
            bottom). Always mounted so it can fade in/out smoothly both ways. */}
        <span className={`fvh-mwp-playframe${d.playing ? " on" : ""}`} />
        <span className="fvh-mwp-code">{mapCode(prettifyMapName(d.map))}</span>
        <span className="fvh-mwp-name">{prettifyMapName(d.map)}</span>
        {d.tag && (
          <span
            className={`fvh-mwp-tag ${d.tag.cls}${d.playing ? " hidden" : ""}`}
          >
            {d.tag.label}
          </span>
        )}
        {/* PLAYING chip shares the BAN/PICK anchor; crossfades in over them. */}
        <span className={`fvh-mwp-playtag${d.playing ? " on" : ""}`}>
          <span className="fvh-mwp-playdot" />
          PLAYING
        </span>
        {d.showPct ? (
          <span className="fvh-mwp-pct">{d.pct}%</span>
        ) : (
          <span className="fvh-mwp-pending">
            <span className="fvh-sweep" />
          </span>
        )}
        <span className="fvh-mwp-bar">
          <span style={{ width: `${d.barW}%`, background: d.color }} />
        </span>
      </div>
    );

    const inner =
      hover && breakdownReady && !exit ? (
        <Hoverable
          className="fvh-mwp-anchor"
          active={hover.activeKey === d.map}
          onEnter={() => hover.onEnter(d.map)}
          onLeave={hover.onLeave}
          renderTooltips={(ref) => (
            // gap clears the panel's right padding + border so the popover sits
            // beside the window, not on top of it
            <Tooltip anchorRef={ref} placement="side" gap={26}>
              <MapBreakdownPopover
                mainTeam={breakdownMain}
                otherTeam={breakdownOther}
                map={d.map}
                pct={d.pct}
                pctColor={d.color}
              />
            </Tooltip>
          )}
        >
          {card}
        </Hoverable>
      ) : (
        card
      );

    const cls = exit
      ? " fvh-mwp-exit"
      : enter
        ? " fvh-mwp-enter"
        : "";
    return (
      <div
        key={d.map}
        className={`fvh-mwp-slot${cls}`}
        style={{
          top: d.top,
          pointerEvents: exit ? "none" : undefined,
          // Lift the live card above the others so a neighbour's blurred
          // thumbnail never slides over it during the re-sort animation. Its own
          // frame/PLAYING chip/bar are children, so they stay above it.
          zIndex: d.playing ? 2 : undefined,
        }}
      >
        {inner}
      </div>
    );
  };

  return (
    <div className={`fvh-mwp${wide ? " fvh-mwp-wide" : ""}`}>
      <p className="fvh-mwp-title">
        Win probability for{" "}
        <span className="fvh-mwp-team">{mainTeam?.name ?? "your team"}</span>
      </p>
      <div className="fvh-mwp-list" style={{ height: mapPool.length * ROW - 6 }}>
        {cards.map(renderCard)}
      </div>
      <div className="fvh-mwp-legend">
        <span>
          <span className="fvh-mwp-dot low" />
          Low — ban it
        </span>
        <span>
          <span className="fvh-mwp-dot high" />
          High — keep it
        </span>
        {bodyStatus && (
          <span className="fvh-mwp-status">
            <span className="fvh-spinner" />
            <span className="vh-num">{bodyStatus}</span>
          </span>
        )}
      </div>
    </div>
  );
}
