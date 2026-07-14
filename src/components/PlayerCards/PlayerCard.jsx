import { useEffect, useRef, useState } from "react";
import { getFlagSvg } from "../../flags";
import {
  avatarStyle,
  histMeta,
  statTiles,
  statusIcon,
  statusMeta,
  verifyCheckSvg,
} from "./cardHelpers";
import LevelIcon from "./LevelIcon";
import HistoryPopover from "./HistoryPopover";
import CardBadges from "./CardBadges";
import StatusPopover from "./StatusPopover";

// Country flag with no `title` — the browser's "kr"/"gb" tooltip on hover was
// noise; the flag is purely visual. Shared with the compact sub/coach card.
export function Flag({ code }) {
  const svg = getFlagSvg(code);
  if (!svg) return null;
  return (
    <span className="fvh-pc-flag" dangerouslySetInnerHTML={{ __html: svg }} />
  );
}

// One player card. `mirror` flips the party bracket to the right edge for team 2
// (everything else stays put, per the design). `onAction(kind)` proxy-clicks
// FACEIT's native Like/Block/Report button for this player.
export default function PlayerCard({
  player,
  summary,
  league,
  fpl,
  encounter,
  status,
  tier,
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
  const [statOpen, setStatOpen] = useState(false);
  const [statRect, setStatRect] = useState(null);
  const wrapRef = useRef(null);
  const chipRef = useRef(null);
  const pillRef = useRef(null);

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
  const verifySvg = verifyCheckSvg(summary?.verificationLevel);
  const meta = histMeta(encounter);
  // AFK/KICKED/LEAVER (design 9a): outline + left fade + under-name banner.
  const sm = status ? statusMeta(status) : null;
  const tiles = statsEnabled ? statTiles(player.card) : null;
  const statsLoading = statsEnabled && !player.loaded;
  // Action buttons mirror FACEIT's native ones: read fresh on hover (they're only
  // rendered natively during the short like/report window), and show only those
  // that actually exist so our buttons never appear when they'd do nothing.
  const actionList =
    hover && !isSelf && onAction && getActions ? getActions() : [];
  const showActions = actionList.length > 0;

  const avStyle = avatarStyle(profile?.avatar);

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
      style={{ zIndex: histOpen || statOpen ? 60 : 1 }}
    >
      {party?.bracket && (
        <div
          className={`fvh-pc-bracket ${mirror ? "mirror" : ""}`}
          style={{ borderColor: party.color }}
        />
      )}
      <div
        className="fvh-pc-card"
        style={sm ? { borderColor: sm.bd } : undefined}
        onClick={(e) => onOpenProfile?.(e.currentTarget.getBoundingClientRect())}
      >
        {/* Soft left fade tinting the card in the status colour (below the
            z-index:2 content, above the bg/scrim). */}
        {sm && (
          <div
            className="fvh-pc-statusfade"
            style={{
              background: `linear-gradient(90deg, ${sm.bg}, transparent 42%)`,
            }}
          />
        )}
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
            <div className="fvh-pc-avatar" style={avStyle} />
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
            <CardBadges
              memberships={profile?.memberships}
              tier={tier}
              hubBadge={summary?.hubBadge}
              league={league}
              fpl={fpl}
              mirror={mirror}
            />
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
            {/* Status banner pill in normal flow directly under the name (9a). */}
            {sm && (
              <span
                ref={pillRef}
                className="fvh-pc-statuspill"
                style={{
                  color: sm.color,
                  background: sm.bg,
                  border: `1px solid ${sm.bd}`,
                }}
                onMouseEnter={() => {
                  if (pillRef.current) {
                    setStatRect(pillRef.current.getBoundingClientRect());
                  }
                  setStatOpen(true);
                }}
                onMouseLeave={() => setStatOpen(false)}
              >
                <span
                  className="fvh-pc-statuspill-ic"
                  dangerouslySetInnerHTML={{ __html: statusIcon(sm.icon, 9) }}
                />
                {sm.label}
              </span>
            )}
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
        <HistoryPopover guid={profile.id} anchorRect={anchorRect} />
      )}

      {sm && statOpen && statRect && (
        <StatusPopover meta={sm} anchorRect={statRect} />
      )}

    </div>
  );
}
