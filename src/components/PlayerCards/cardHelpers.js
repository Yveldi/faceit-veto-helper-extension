// Presentational helpers for the player cards, lifted from the design mock
// (Player Card Options.dc.html). Colours match the shared win ramp / stat
// colours used elsewhere in the extension. Pure functions + inline SVG markup;
// no state.

// --- stat colours (design's wrColor/kdColor/hsColor/ratingColor) ------------
export const STAT_NEUTRAL = "#dfe2e6";

export function wrColor(p) {
  return p >= 55 ? "#6fe09a" : p >= 50 ? "#e6c14a" : "#ff8585";
}
export function kdColor(v) {
  return v >= 1.1 ? "#6fe09a" : v >= 0.95 ? "#e6c14a" : "#ff8585";
}
export function hsColor(v) {
  return v >= 50 ? "#6fe09a" : v >= 45 ? "#e6c14a" : "#ff8585";
}
export function ratingColor(v) {
  return v >= 1.1 ? "#6fe09a" : v >= 0.95 ? "#e6c14a" : "#ff8585";
}

// Build the 7 stat tiles for the band from a computeCardStats() result. A null
// stat renders "-" in the neutral colour.
export function statTiles(card) {
  const fmt = (v, d, suffix = "") =>
    v === null || v === undefined ? "-" : v.toFixed(d) + suffix;
  const colOr = (v, fn) =>
    v === null || v === undefined ? STAT_NEUTRAL : fn(v);
  return [
    { label: "WIN", val: fmt(card?.win, 0, "%"), color: colOr(card?.win, wrColor) },
    { label: "KILLS", val: fmt(card?.kills, 1), color: STAT_NEUTRAL },
    { label: "K/D", val: fmt(card?.kd, 2), color: colOr(card?.kd, kdColor) },
    { label: "K/R", val: fmt(card?.kr, 2), color: STAT_NEUTRAL },
    {
      label: "ADR",
      val: card?.adr === null || card?.adr === undefined ? "-" : Math.round(card.adr),
      color: STAT_NEUTRAL,
    },
    { label: "HS%", val: fmt(card?.hs, 0, "%"), color: colOr(card?.hs, hsColor) },
    {
      label: "RATING",
      val: fmt(card?.rating, 2),
      color: colOr(card?.rating, ratingColor),
    },
  ];
}

// --- verified / VIP checkmark (real FACEIT SVGs) ----------------------------
// Source: FACEIT's own `user-summary` `verification_level`. White = standard
// verified account; golden = VIP (famous players). Threshold for gold is a best
// guess (levels above the common "verified" value); white covers the common case.
export const CHECK_WHITE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" height="15" width="15"><path fill="#fff" fill-rule="evenodd" d="M5 5h4l3-3 3 3h4v4l3 3-3 3v4h-4l-3 3-3-3H5v-4l-3-3 3-3zm6.098 11.737-5.414-5.684 5.414 1.894 7.218-5.684z" clip-rule="evenodd"></path></svg>';

export const CHECK_GOLD_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" height="15" width="15"><path fill="url(#a__vfg)" fill-rule="evenodd" d="M5 5h4l3-3 3 3h4v4l3 3-3 3v4h-4l-3 3-3-3H5v-4l-3-3 3-3zm6.098 11.737-5.414-5.684 5.414 1.894 7.218-5.684z" clip-rule="evenodd"></path><mask id="c__vfg" width="20" height="20" x="2" y="2" maskUnits="userSpaceOnUse" style="mask-type: alpha;"><path fill="url(#b__vfg)" fill-rule="evenodd" d="M5 5h4l3-3 3 3h4v4l3 3-3 3v4h-4l-3 3-3-3H5v-4l-3-3 3-3zm6.098 11.737-5.414-5.684 5.414 1.894 7.218-5.684z" clip-rule="evenodd"></path></mask><g mask="url(#c__vfg)"><path fill="url(#d__vfg)" d="M25.678.178c-9.964-5.37-19.835-1.61-23.525.941l.062 2.252C8.272 10.572 17.682 14.05 21.63 14.887c4.416-6.392 4.539-12.47 4.048-14.71"></path></g><defs><linearGradient id="a__vfg" x1="12" x2="12" y1="2" y2="22" gradientUnits="userSpaceOnUse"><stop stop-color="#FFFFB4"></stop><stop offset="1" stop-color="#F4982F"></stop></linearGradient><linearGradient id="b__vfg" x1="12" x2="12" y1="2" y2="22" gradientUnits="userSpaceOnUse"><stop stop-color="#FFFFB4"></stop><stop offset="1" stop-color="#F4982F"></stop></linearGradient><linearGradient id="d__vfg" x1="13.899" x2="14.385" y1="-2.538" y2="15.087" gradientUnits="userSpaceOnUse"><stop stop-color="#fff" stop-opacity="0"></stop><stop offset="1" stop-color="#fff" stop-opacity=".35"></stop></linearGradient></defs></svg>';

// Which checkmark (if any) for a verification level. Absent/0/1 -> none.
export function verifyCheckSvg(level) {
  if (typeof level !== "number") return null;
  if (level >= 3) return CHECK_GOLD_SVG;
  if (level >= 2) return CHECK_WHITE_SVG;
  return null;
}

// --- ESEA emblem (green star), lifted verbatim from the design --------------
export const ESEA_SVG =
  '<svg viewBox="0 0 30 23" fill="none" xmlns="http://www.w3.org/2000/svg" height="14" width="14"><path d="M16.564 1.588c.39-.541.778-1.078 1.198-1.588.059.53.098 1.059.133 1.588.171 2.386.35 4.772.513 7.158h-6.895a6.026 6.026 0 01-.778 2.475c-.778 1.254-2.07 2.075-3.245 2.935a11095.7 11095.7 0 0013.518-3.34c2.933-.688 5.836-1.498 8.786-2.12-3.623 1.922-7.358 3.627-11.008 5.491.206 2.838.389 5.675.595 8.509v.249l-.338-.25c-2.34-1.73-4.685-3.457-7.035-5.18-3.537 1.716-7.059 3.46-10.592 5.188l-.389.18.12-.18c2.055-2.876 4.164-5.713 6.226-8.563L0 8.691c3.778-.05 7.552.047 11.327.04l5.237-7.143z" fill="#029547"></path></svg>';

// membership -> subscription glyph/colour. Premium = gold star, Plus = cyan +.
export function subBadge(memberships) {
  const m = (memberships || []).map((x) => String(x).toLowerCase());
  if (m.includes("premium")) return { glyph: "★", color: "#e8b23a" };
  if (m.includes("plus")) return { glyph: "+", color: "#39c0d6" };
  return null;
}

export function hasEsea(memberships) {
  return (memberships || []).map((x) => String(x).toLowerCase()).includes("esea");
}

// --- history chip metadata (with / against / mixture) -----------------------
export function histMeta(encounter) {
  if (!encounter || encounter.total === 0) return null;
  const withT = encounter.sameTeam > 0;
  const vs = encounter.enemy > 0;
  if (withT && vs)
    return {
      glyph: "⇄",
      label: "Played with & against",
      color: "#ffb27a",
      bg: "rgba(255,138,77,.14)",
      bd: "rgba(255,138,77,.42)",
    };
  if (withT)
    return {
      glyph: "🤝",
      label: "Played with",
      color: "#6fe09a",
      bg: "rgba(56,196,104,.14)",
      bd: "rgba(56,196,104,.4)",
    };
  return {
    glyph: "⚔",
    label: "Played against",
    color: "#ff8585",
    bg: "rgba(232,65,46,.13)",
    bd: "rgba(232,65,46,.4)",
  };
}
