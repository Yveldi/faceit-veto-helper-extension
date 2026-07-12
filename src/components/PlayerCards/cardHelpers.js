// Presentational helpers for the player cards, lifted from the design mock
// (Player Card Options.dc.html). Colours match the shared win ramp / stat
// colours used elsewhere in the extension. Pure functions + inline SVG markup;
// no state.

// --- default avatar ----------------------------------------------------------
// FACEIT's own placeholder silhouette (their `styles__RawStyledISvg` default),
// inlined as a data-URI so a player with no avatar shows a real fallback instead
// of a bare dark circle. Rendered centred over the circle background.
const DEFAULT_AVATAR_SVG =
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80' fill='none'>` +
  `<path d='M13.333 66.667h53.334V60c0-7.364-5.97-13.333-13.334-13.333H26.667c-7.364 0-13.334 5.97-13.334 13.333v6.667zm13.334-53.334h26.666V30c0 5.523-4.477 10-10 10h-6.666c-5.523 0-10-4.477-10-10V13.333z' fill='rgba(231,232,236,0.32)'/></svg>`;
export const DEFAULT_AVATAR =
  "data:image/svg+xml," + encodeURIComponent(DEFAULT_AVATAR_SVG);

// Background style for an avatar div: the player's avatar if present, else the
// default silhouette centred (contained, not covering) so it reads as an icon.
export function avatarStyle(url) {
  return url
    ? { backgroundImage: `url('${url}')` }
    : {
        backgroundImage: `url("${DEFAULT_AVATAR}")`,
        backgroundSize: "62%",
      };
}

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
      // On the CARD the rating stays HIDDEN behind a loading shimmer until the
      // real FACEIT rating lands (match-rounds, wave 2) — we don't surface the
      // estimate here (unlike the Veto Helper surfaces, which pulse it). All the
      // other tiles are already final from wave 1.
      loading: !!card?.ratingEstimated,
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

// --- FPL emblem (red diamond), lifted verbatim from the design --------------
// Shown in the SAME bottom-left slot as the ESEA badge; FPL takes priority (see
// the card), because being on the FPL proves more than having an ESEA team.
export const FPL_SVG =
  '<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" height="14" width="14"><path fill-rule="evenodd" clip-rule="evenodd" d="M12.336 6.875L4.7 20l7.636 13.125h15.327L35.3 20 27.664 6.875H12.335zm13.6 6.637c0-.124-.137-.163-.203-.065a739.508 739.508 0 00-3.94 6.104H10.454c-.144 0-.196.183-.072.228 4.706 1.778 11.502 4.45 15.3 5.947.097.04.254-.052.254-.117V13.511z" fill="#FF2600"></path><path fill-rule="evenodd" clip-rule="evenodd" d="M10 2.813h20L40 20 30 37.188H10L0 20 10 2.812zM2.17 20l8.908-15.313h17.844L37.83 20l-8.91 15.313H11.079L2.17 20z" fill="#FF2600"></path></svg>';

// Real FACEIT subscription badge (the diamond-star), lifted verbatim from the
// design. `tier` ∈ plus | base | gold | platinum | diamond | elite | legend.
// We can only DETECT plus vs base from the roster's `memberships` (there's no
// tier field), so higher tiers are here for completeness but never rendered.
export function subSvg(tier, px) {
  const BG =
    '<path fill-rule="evenodd" clip-rule="evenodd" d="M24 7.03801L16.9766 0.00606372L7.03801 0L0.00606401 7.02337L0 16.962L7.02337 23.9939L16.962 24L23.9939 16.9766L24 7.03801Z" fill="#161616"></path>';
  const STAR =
    "M22 7.86501L16.1472 2.00505L7.86501 2L2.00505 7.85281L2 16.135L7.85281 21.9949L16.135 22L21.9949 16.1472L22 7.86501ZM12.0944 3.93824C12.0633 3.84869 11.9367 3.84869 11.9055 3.93824L10.0636 9.23739C10.0498 9.27689 10.0129 9.30368 9.97113 9.30453L4.36215 9.41883C4.26735 9.42077 4.22822 9.54122 4.30377 9.5985L8.77435 12.9879C8.80768 13.0131 8.82176 13.0565 8.80965 13.0965L7.18509 18.4663C7.15763 18.557 7.2601 18.6315 7.33792 18.5773L11.9429 15.3729C11.9772 15.349 12.0228 15.349 12.0571 15.3729L16.6621 18.5773C16.7399 18.6315 16.8423 18.557 16.8149 18.4663L15.1903 13.0965C15.1782 13.0565 15.1923 13.0131 15.2256 12.9879L19.6962 9.5985C19.7718 9.54122 19.7326 9.42077 19.6378 9.41883L14.0288 9.30453C13.987 9.30368 13.9502 9.27689 13.9364 9.23739L12.0944 3.93824Z";
  const PLUS =
    "M16.1472 2.00505L22 7.86501L21.9949 16.1472L16.135 22L7.85281 21.9949L2 16.135L2.00505 7.85281L7.86501 2L16.1472 2.00505ZM12.0002 8.4432L15.3011 11.7911L16.5 10.5634L12.0002 6L7.5 10.5634L8.69887 11.7911L12.0002 8.4432ZM15.3011 16.9997L12.0002 13.6518L8.69887 16.9997L7.5 15.7719L12.0002 11.2086L16.5 15.7719L15.3011 16.9997Z";
  const grad = {
    diamond:
      '<linearGradient id="pm_diamond" x1="12" y1="2" x2="12" y2="22" gradientUnits="userSpaceOnUse"><stop stop-color="#A998FF"></stop><stop offset="1" stop-color="#866DFF"></stop></linearGradient>',
    elite:
      '<linearGradient id="pm_elite" x1="12" y1="1.98265" x2="12" y2="22.0173" gradientUnits="userSpaceOnUse"><stop stop-color="#FF7FFF"></stop><stop offset="0.333333" stop-color="#AB1EF9"></stop><stop offset="0.666667" stop-color="#0033FF"></stop><stop offset="1" stop-color="#74E0FE"></stop></linearGradient>',
    legend:
      '<linearGradient id="pm_legend" x1="12" y1="2" x2="12" y2="22" gradientUnits="userSpaceOnUse"><stop stop-color="#A80A08"></stop><stop offset="0.5" stop-color="#DE5624"></stop><stop offset="1" stop-color="#FFFA85"></stop></linearGradient>',
  };
  const fills = {
    plus: "#FF5500",
    base: "#FF5500",
    gold: "#D9A441",
    platinum: "#85CEF2",
    diamond: "url(#pm_diamond)",
    elite: "url(#pm_elite)",
    legend: "url(#pm_legend)",
  };
  const t = tier || "base";
  const path = t === "plus" ? PLUS : STAR;
  const fill = fills[t] || "#FF5500";
  const defs = grad[t] ? "<defs>" + grad[t] + "</defs>" : "";
  return `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" height="${px}" width="${px}">${BG}<path fill-rule="evenodd" clip-rule="evenodd" d="${path}" fill="${fill}"></path>${defs}</svg>`;
}

// ESEA division -> colour for the hover popover's DIVISION value. Colour scheme
// per the developer: Advanced = red, Main = platinum, Intermediate = gold,
// everything else (Open / Entry / ...) = white. Order matters only in that each
// name is distinct, so plain substring tests are safe.
export function eseaDivColor(division) {
  const d = String(division || "");
  if (/Advanced/i.test(d)) return "#e80128"; // red
  if (/Main/i.test(d)) return "#85cef2"; // platinum (FACEIT's platinum-badge blue)
  if (/Intermediate/i.test(d)) return "#f5c542"; // gold
  return "#8b8f98"; // muted grey (Open / Entry / ...)
}

// --- per-player action buttons (Like / Block / Report) ----------------------
// Rendered on card hover; each proxy-clicks FACEIT's native button of the same
// index (0 Like, 1 Block, 2 Report) — see PLAYER_CARDS_SPEC §9. `currentColor`
// so the button's own colour drives the glyph.
export const ACTIONS = [
  {
    kind: "like",
    index: 0,
    title: "Recommend",
    svg: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M7 10v11M7 10l4-7a1.5 1.5 0 012.6 1l-.8 4H19a2 2 0 012 2.3l-1.2 6.4A2 2 0 0117.8 21H7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  },
  {
    kind: "block",
    index: 1,
    title: "Block",
    svg: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7"/><path d="M5.6 5.6l12.8 12.8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  },
  {
    kind: "report",
    index: 2,
    title: "Report",
    svg: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 8v5M12 16v.5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M10.3 3.9L2.5 18a2 2 0 001.7 3h15.6a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  },
];

// membership -> subscription badge tier. The roster only tells us premium vs
// plus (no colour tier), so we map premium -> "base" and plus -> "plus"; the
// card renders the real badge SVG via subSvg(tier). null = no subscription.
// The COLOUR tier (gold/platinum/diamond/elite/legend) is read separately from
// the native roster's own badge (tierFromNativeBadge) and overrides this.
export function subTier(memberships) {
  const m = (memberships || []).map((x) => String(x).toLowerCase());
  if (m.includes("premium")) return "base";
  if (m.includes("plus")) return "plus";
  return null;
}

// Premium COLOUR tier, read from FACEIT's OWN badge SVG in the (hidden) native
// roster row. No API we can call or piggyback carries the tier (user-summary,
// match/v2 and monetization/summary all lack it; FACEIT's client gets it over a
// transport page-level fetch/XHR wrapping can't see), but FACEIT renders the
// tier-coloured badge into the native rows we keep display:none'd, so we read
// it there (same pattern as the AFK/LEAVER statuses). Each tier's badge has a
// unique fill / gradient-stop set (verified live in a logged-in matchroom):
// gold #D9A441, platinum #85CEF2, diamond #A998FF->#866DFF, elite 4-stop
// (#FF7FFF/#AB1EF9/#0033FF/#74E0FE), legend #A80A08->#DE5624->#FFFA85. Base
// premium + plus are both plain #FF5500 -> return null and let subTier decide.
export function tierFromNativeBadge(rowEl) {
  if (!rowEl?.querySelectorAll) return null;
  // The hexagon outline path ("24 7.03801...") is shared by every subscription
  // badge and by nothing else in the row, so it identifies the badge among the
  // other icons FACEIT also tags "membership badge" (e.g. the ESEA star).
  const svgs = rowEl.querySelectorAll('[data-testid="membership badge"] svg');
  for (const svg of svgs) {
    const paths = [...svg.querySelectorAll("path")];
    if (!paths.some((p) => (p.getAttribute("d") || "").includes("7.03801"))) {
      continue;
    }
    const colors = [
      ...paths.map((p) => p.getAttribute("fill") || ""),
      ...[...svg.querySelectorAll("stop")].map(
        (s) => s.getAttribute("stop-color") || "",
      ),
    ]
      .join(" ")
      .toUpperCase();
    if (colors.includes("#A80A08") || colors.includes("#FFFA85")) return "legend";
    if (colors.includes("#AB1EF9") || colors.includes("#0033FF")) return "elite";
    if (colors.includes("#A998FF") || colors.includes("#866DFF")) return "diamond";
    if (colors.includes("#85CEF2")) return "platinum";
    if (colors.includes("#D9A441")) return "gold";
    return null; // plain #FF5500 = base premium or plus -> memberships decide
  }
  return null;
}

export function hasEsea(memberships) {
  return (memberships || []).map((x) => String(x).toLowerCase()).includes("esea");
}

// Match-outcome status (AFK / KICKED / LEAVER), design option 9a. Per-state
// tokens lifted verbatim from the design (`statusMeta`). `kind` is one of
// afk|kicked|left (see classifyStatus); null = normal card.
const STATUS_META = {
  afk: {
    label: "AFK",
    color: "#ffd24a",
    bg: "rgba(245,197,66,.16)",
    bd: "rgba(245,197,66,.55)",
    glow: "rgba(245,197,66,.5)",
    icon: "clock",
    desc: "Failed to join the server in time.",
  },
  kicked: {
    label: "KICKED",
    color: "#ff8a6a",
    bg: "rgba(232,65,46,.18)",
    bd: "rgba(232,65,46,.6)",
    glow: "rgba(232,65,46,.55)",
    icon: "kick",
    desc: "Removed from the match by team vote.",
  },
  left: {
    label: "LEAVER",
    color: "#ff7a7a",
    bg: "rgba(176,40,42,.32)",
    bd: "rgba(232,65,46,.55)",
    glow: "rgba(232,65,46,.5)",
    icon: "exit",
    desc: "Abandoned the match before it finished.",
  },
};
export function statusMeta(kind) {
  return STATUS_META[kind] || null;
}

// Status glyphs (design's statusIcon) — stroke SVGs, viewBox 0 0 24 24.
export function statusIcon(icon, px) {
  const s = `width="${px}" height="${px}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"`;
  if (icon === "clock")
    return `<svg ${s}><circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/></svg>`;
  if (icon === "kick")
    return `<svg ${s}><circle cx="12" cy="12" r="9"/><path d="M8.5 8.5l7 7"/></svg>`;
  return `<svg ${s}><path d="M14 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M9 16l-4-4 4-4"/><path d="M5 12h11"/></svg>`;
}

// Classify FACEIT's native `styles__Status` tag TEXT into a design kind. The tag
// is language-dependent, so this matches the common (English) tokens and falls
// back to "left" (leaver) for anything unrecognised — better to surface an
// unknown status as a red leaver banner than to drop it.
export function classifyStatus(text) {
  const t = String(text || "").toLowerCase();
  if (!t) return null;
  if (/afk/.test(t)) return "afk";
  if (/kick/.test(t)) return "kicked";
  return "left";
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
