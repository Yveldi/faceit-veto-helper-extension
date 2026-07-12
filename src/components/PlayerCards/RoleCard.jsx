import { useEffect, useRef, useState } from "react";
import { Flag } from "./PlayerCard";
import CardBadges from "./CardBadges";
import HistoryPopover from "./HistoryPopover";
import StatusPopover from "./StatusPopover";
import LevelIcon from "./LevelIcon";
import {
  avatarStyle,
  histMeta,
  statusIcon,
  statusMeta,
  verifyCheckSvg,
} from "./cardHelpers";

// Compact card for a substitute or coach (the design's dense single row, no
// stats band). `role` is "sub" or "coach": a sub shows the elo+level cluster, a
// coach shows neither (they don't play). Everything here is FREE — nickname/elo/
// level/memberships are inline in the match payload, and country/cosmetics/hub
// badge/ESEA/FPL all come from the already-piggybacked calls — so no per-person
// stats fetch happens for subs or coaches (unlike the full player card).
export default function RoleCard({
  player,
  summary,
  league,
  fpl,
  encounter,
  status,
  tier,
  role,
  mirror,
  onOpenProfile,
}) {
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
  const country = summary?.country;
  const verifySvg = verifyCheckSvg(summary?.verificationLevel);
  const meta = histMeta(encounter);
  // elo/level can be missing OR zero on subs/coaches (see the findings doc), so
  // tolerate both — only surface what actually exists.
  const elo = profile?.games?.cs2?.faceit_elo ?? 0;
  const level = profile?.skillLevel ?? 0;
  const showCluster = role !== "coach";
  // AFK/KICKED/LEAVER (design 9a), adapted to the compact card: outline + a soft
  // left fade layered onto the card background, plus the under-name banner pill.
  const sm = status ? statusMeta(status) : null;
  const cardStyle = sm
    ? {
        borderColor: sm.bd,
        backgroundImage: `linear-gradient(90deg, ${sm.bg}, transparent 42%)`,
      }
    : undefined;

  const avStyle = avatarStyle(profile?.avatar);

  return (
    <div
      className="fvh-pc-rc-wrap"
      ref={wrapRef}
      style={{ zIndex: histOpen || statOpen ? 60 : 1 }}
    >
      <div
        className="fvh-pc-rc-card"
        style={cardStyle}
        onClick={(e) => onOpenProfile?.(e.currentTarget.getBoundingClientRect())}
      >
        <div className="fvh-pc-rc-avatarwrap">
          <div className="fvh-pc-rc-avatar" style={avStyle} />
          <CardBadges
            memberships={profile?.memberships}
            tier={tier}
            hubBadge={summary?.hubBadge}
            league={league}
            fpl={fpl}
            mirror={mirror}
          />
        </div>

        <div className="fvh-pc-rc-namecol">
          <div className="fvh-pc-rc-nameline">
            {country && <Flag code={country} />}
            <span className="fvh-pc-rc-name">{profile?.nickname}</span>
            {verifySvg && (
              <span
                className="fvh-pc-verify"
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

        {showCluster && (elo > 0 || level > 0) && (
          <div className="fvh-pc-rc-cluster">
            {elo > 0 && (
              <span className="fvh-pc-rc-elo">
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M1 11l4-4 3 3 6-7"
                    stroke="#c8ccd2"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="fvh-pc-rc-elonum">{elo}</span>
              </span>
            )}
            {level > 0 && <LevelIcon level={level} size={20} />}
          </div>
        )}
      </div>

      {meta && histOpen && anchorRect && (
        <HistoryPopover guid={profile.id} meta={meta} anchorRect={anchorRect} />
      )}

      {sm && statOpen && statRect && (
        <StatusPopover meta={sm} anchorRect={statRect} />
      )}
    </div>
  );
}
