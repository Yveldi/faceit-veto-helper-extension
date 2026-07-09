import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getFlagSvg } from "../../flags";
import {
  ESEA_SVG,
  hasEsea,
  histMeta,
  statTiles,
  subBadge,
  verifyCheckSvg,
} from "./cardHelpers";
import LevelIcon from "./LevelIcon";
import { getPlayerHistory } from "../../playerTracking/store";

// Relative "2d ago" style label from unix seconds.
function ago(unixSeconds) {
  if (!unixSeconds) return "";
  const secs = Math.max(0, Math.floor(Date.now() / 1000) - unixSeconds);
  const d = Math.floor(secs / 86400);
  if (d >= 1) return `${d}d`;
  const h = Math.floor(secs / 3600);
  if (h >= 1) return `${h}h`;
  const m = Math.floor(secs / 60);
  return `${m}m`;
}

function Flag({ code }) {
  const svg = getFlagSvg(code);
  if (!svg) return null;
  return (
    <span
      className="fvh-pc-flag"
      title={code}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

const ROOM_URL = "https://www.faceit.com/en/cs2/room/";

// The popover is PORTALED to document.body and positioned fixed from the chip's
// rect, so it renders on top of everything and is never clipped by the roster
// column's overflow (the left team used to crop it). It's closeable, so drawing
// over the middle column is fine.
function HistoryPopover({ guid, meta, anchorRect }) {
  const rows = getPlayerHistory(guid);
  const W = 250;
  const left = Math.max(
    8,
    Math.min(anchorRect.left, window.innerWidth - W - 8),
  );
  const top = Math.min(anchorRect.bottom + 6, window.innerHeight - 260);
  return createPortal(
    // Wrapped in a bare .fvh-root so the scoped `.fvh-root .fvh-pc-histpop`
    // styles (and the host-CSS reset) actually apply once portaled to body.
    <div
      className="fvh-root"
      style={{ position: "fixed", left, top, zIndex: 2147483000 }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="fvh-pc-histpop" style={{ position: "static" }}>
      <div className="fvh-pc-histhead">
        <span style={{ color: meta.color }}>
          {meta.glyph} {meta.label}
        </span>
        <span className="fvh-pc-histcount">{rows.length} matches</span>
      </div>
      <div className="fvh-pc-histscroll">
        {rows.map((r, i) => {
          const win = (r.score?.[0] ?? 0) > (r.score?.[1] ?? 0);
          return (
            <a
              className="fvh-pc-histrow"
              key={r.matchId + i}
              href={ROOM_URL + r.matchId}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span
                className="fvh-pc-histres"
                style={{
                  color: win ? "#6fe09a" : "#ff8585",
                  background: win
                    ? "rgba(56,196,104,.16)"
                    : "rgba(232,65,46,.15)",
                }}
              >
                {win ? "W" : "L"}
              </span>
              <div className="fvh-pc-histmid">
                <div className="fvh-pc-histscore">
                  {(r.score?.[0] ?? 0)} - {(r.score?.[1] ?? 0)}
                </div>
                <div className="fvh-pc-histago">{ago(r.date)} ago</div>
              </div>
              <span
                className="fvh-pc-histside"
                style={{ color: r.sameTeam ? "#6fe09a" : "#ff8585" }}
              >
                {r.sameTeam ? "WITH" : "VERSUS"}
              </span>
            </a>
          );
        })}
      </div>
      </div>
    </div>,
    document.body,
  );
}

// One player card. `mirror` flips the party bracket to the right edge for team 2
// (everything else stays put, per the design). `onAction(kind)` proxy-clicks
// FACEIT's native Like/Block/Report button for this player.
export default function PlayerCard({
  player,
  summary,
  encounter,
  mirror,
  statsEnabled,
  isSelf,
  party,
  onOpenProfile,
  onAction,
  getActions,
}) {
  const [hover, setHover] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState(null);
  const wrapRef = useRef(null);
  const chipRef = useRef(null);

  useEffect(() => {
    if (!histOpen) return;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setHistOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [histOpen]);

  const profile = player.profile;
  const elo = profile?.games?.cs2?.faceit_elo ?? 0;
  const country = summary?.country;
  const esea = hasEsea(profile?.memberships);
  const sub = subBadge(profile?.memberships);
  const verifySvg = verifyCheckSvg(summary?.verificationLevel);
  const meta = histMeta(encounter);
  const tiles = statsEnabled ? statTiles(player.card) : null;
  const statsLoading = statsEnabled && !player.loaded;
  // Action buttons mirror FACEIT's native ones: read fresh on hover (they're only
  // rendered natively during the short like/report window), and show only those
  // that actually exist so our buttons never appear when they'd do nothing.
  const actionList =
    hover && !isSelf && onAction && getActions ? getActions() : [];
  const showActions = actionList.length > 0;

  const avatarStyle = profile?.avatar
    ? { backgroundImage: `url('${profile.avatar}')` }
    : {};

  // Cosmetics: static by default, the animated variant on hover (like FACEIT's
  // own cards). To avoid a jarring instant swap, the static and animated layers
  // are BOTH mounted and crossfade by opacity (quick, both directions) — the
  // animated layer fades in over the static one on hover and back out on leave.
  const staticFrame = summary?.frame;
  const animFrame = summary?.animatedFrame;
  const staticBg = summary?.profileBg;
  const animBg = summary?.animatedProfileBg;
  const hasBg = !!(staticBg || animBg);
  const BG_OPACITY = 0.16;

  return (
    <div
      className="fvh-pc-wrap"
      ref={wrapRef}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ zIndex: histOpen ? 60 : 1 }}
    >
      {party?.bracket && (
        <div
          className={`fvh-pc-bracket ${mirror ? "mirror" : ""}`}
          style={{ borderColor: party.color }}
        />
      )}
      <div
        className="fvh-pc-card"
        onClick={(e) => onOpenProfile?.(e.currentTarget.getBoundingClientRect())}
        title="View profile"
      >
        {hasBg && (
          <>
            {staticBg && (
              <div
                className="fvh-pc-bg"
                style={{
                  backgroundImage: `url('${staticBg}')`,
                  opacity: hover && animBg ? 0 : BG_OPACITY,
                }}
              />
            )}
            {animBg && (
              <div
                className="fvh-pc-bg"
                style={{
                  backgroundImage: `url('${animBg}')`,
                  opacity: hover ? BG_OPACITY : 0,
                }}
              />
            )}
            <div className="fvh-pc-bg-scrim" />
          </>
        )}
        <div className="fvh-pc-row">
          <div className="fvh-pc-avatarwrap">
            <div className="fvh-pc-avatar" style={avatarStyle} />
            {staticFrame && (
              <div
                className="fvh-pc-frame"
                style={{
                  backgroundImage: `url('${staticFrame}')`,
                  opacity: hover && animFrame ? 0 : 1,
                }}
              />
            )}
            {animFrame && (
              <div
                className="fvh-pc-frame"
                style={{
                  backgroundImage: `url('${animFrame}')`,
                  opacity: hover ? 1 : 0,
                }}
              />
            )}
            {sub && (
              <span
                className="fvh-pc-sub"
                style={{ background: sub.color }}
                title="Subscription"
              >
                {sub.glyph}
              </span>
            )}
            {esea && (
              <span
                className="fvh-pc-esea"
                title="ESEA subscriber"
                dangerouslySetInnerHTML={{ __html: ESEA_SVG }}
              />
            )}
          </div>

          <div className="fvh-pc-namecol">
            <div className="fvh-pc-nameline">
              {country && <Flag code={country} />}
              <span className={`fvh-pc-name ${isSelf ? "self" : ""}`}>
                {profile?.nickname}
              </span>
              {verifySvg && (
                <span
                  className="fvh-pc-verify"
                  title="Verified"
                  dangerouslySetInnerHTML={{ __html: verifySvg }}
                />
              )}
              {meta && (
                <span
                  ref={chipRef}
                  className="fvh-pc-histchip"
                  title={meta.label}
                  style={{
                    color: meta.color,
                    background: meta.bg,
                    border: `1px solid ${meta.bd}`,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (chipRef.current) {
                      setAnchorRect(chipRef.current.getBoundingClientRect());
                    }
                    setHistOpen((o) => !o);
                  }}
                >
                  {meta.glyph}
                  {encounter.total}
                </span>
              )}
            </div>
          </div>

          <div className="fvh-pc-right">
            {/* Elo/level crossfades OUT on hover as the action buttons fade in. */}
            <div
              className="fvh-pc-elo"
              style={{
                opacity: hover && showActions ? 0 : 1,
                pointerEvents: hover && showActions ? "none" : "auto",
              }}
            >
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                <path
                  d="M1 11l4-4 3 3 6-7"
                  stroke="#c8ccd2"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="fvh-pc-elonum">{elo > 0 ? elo : ""}</span>
              <span className="fvh-pc-level">
                <LevelIcon level={profile?.skillLevel} size={22} />
              </span>
            </div>
            {showActions && (
              // Like / Block / Report — revealed on hover, each proxy-clicks the
              // native FACEIT button; stopPropagation so the card's profile-open
              // click doesn't also fire.
              <div
                className="fvh-pc-actions"
                style={{
                  opacity: hover ? 1 : 0,
                  pointerEvents: hover ? "auto" : "none",
                }}
              >
                {actionList.map((a) => (
                  <span
                    key={a.kind}
                    className={`fvh-pc-act ${a.kind}`}
                    title={a.title}
                    onClick={(e) => {
                      e.stopPropagation();
                      onAction?.(a.index);
                    }}
                    dangerouslySetInnerHTML={{ __html: a.svg }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {statsEnabled && (
          // Both layers stay mounted so the skeleton crossfades out and the
          // tiles fade in (opacity), while the band height rolls from the
          // loading height to the loaded height. tiles render "-" until loaded.
          <div
            className="fvh-pc-band"
            style={{ height: statsLoading ? "34px" : "40px" }}
          >
            <div
              className="fvh-pc-tiles"
              style={{ opacity: statsLoading ? 0 : 1 }}
            >
              {(tiles || []).map((t) => (
                <div className="fvh-pc-tile" key={t.label}>
                  <div className="fvh-pc-tileval" style={{ color: t.color }}>
                    {t.loading ? (
                      <span className="fvh-pc-tileskel">
                        <span className="fvh-sweep" />
                      </span>
                    ) : (
                      t.val
                    )}
                  </div>
                  <div className="fvh-pc-tilelabel">{t.label}</div>
                </div>
              ))}
            </div>
            <div
              className="fvh-pc-skel-row"
              style={{
                opacity: statsLoading ? 1 : 0,
                pointerEvents: "none",
              }}
            >
              {[0, 1, 2, 3, 4].map((i) => (
                <div className="fvh-pc-skel" key={i} />
              ))}
            </div>
          </div>
        )}
      </div>

      {meta && histOpen && anchorRect && (
        <HistoryPopover guid={profile.id} meta={meta} anchorRect={anchorRect} />
      )}
    </div>
  );
}
