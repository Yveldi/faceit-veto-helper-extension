// Presentational color helpers for the veto overlay. Pure, no deps.

// Red -> yellow -> green gradient. `t` in [0,1] (a map's win probability,
// normalized across the current match's spread). Returns the [r,g,b] triple.
export function winRgb(t) {
  const clamp = Math.max(0, Math.min(1, t));
  let c0, c1, f;
  if (clamp < 0.5) {
    c0 = [229, 72, 72];
    c1 = [245, 176, 32];
    f = clamp / 0.5;
  } else {
    c0 = [245, 176, 32];
    c1 = [56, 196, 104];
    f = (clamp - 0.5) / 0.5;
  }
  return [0, 1, 2].map((i) => Math.round(c0[i] + (c1[i] - c0[i]) * f));
}

// Same gradient as a CSS rgb() string.
export function winColor(t) {
  const [r, g, b] = winRgb(t);
  return `rgb(${r},${g},${b})`;
}

// Styling for one per-player-per-map rating cell (and its tooltip row) in the
// Stage 3 matrix and the Stage 2 breakdown. `v` is the player's map score.
export function cellStyle(v) {
  if (v <= 25)
    return { bg: "rgba(229,72,72,.2)", fg: "#ff9d9d", rowBg: "rgba(229,72,72,.06)" };
  if (v <= 60)
    return { bg: "rgba(255,255,255,.05)", fg: "#aeb3bd", rowBg: "transparent" };
  return { bg: "rgba(56,196,104,.2)", fg: "#7fe2a4", rowBg: "rgba(56,196,104,.06)" };
}

// Color for a win-rate percentage: >=55 green, >=50 amber, else red. Used in the
// Stage 3 hover popovers (per-player / per-map stat tiles).
export function winRateColor(pct) {
  if (pct >= 55) return "#6fe09a";
  if (pct >= 50) return "#e6c14a";
  return "#ff8585";
}

// Color for a FACEIT rating (centred on 1.00): >=1.10 green, >=0.95 amber, else
// red. Used in the Stage 3 hover popovers.
export function ratingColor(rating) {
  if (rating >= 1.1) return "#6fe09a";
  if (rating >= 0.95) return "#e6c14a";
  return "#ff8585";
}

// Short uppercase code for a map id, e.g. "de_mirage" -> "MIR". Pool/language
// independent (derived from the prettified name's first letters).
export function mapCode(prettyName) {
  return prettyName.replace(/[^a-z]/gi, "").slice(0, 3).toUpperCase();
}

// FACEIT cs2 skill level (1-10) for an elo, matching FACEIT's own thresholds.
export function eloToLevel(elo) {
  if (!elo) return 1;
  if (elo > 2000) return 10;
  if (elo > 1750) return 9;
  if (elo > 1530) return 8;
  if (elo > 1350) return 7;
  if (elo > 1200) return 6;
  if (elo > 1050) return 5;
  if (elo > 900) return 4;
  if (elo > 750) return 3;
  if (elo > 500) return 2;
  return 1;
}

// The official FACEIT level color tiers (grey -> green -> yellow -> orange ->
// red). Used to tint the elo numbers in the Stage 3 matrix.
export function levelColor(level) {
  if (level >= 10) return "#FE1F00";
  if (level >= 8) return "#FF6309";
  if (level >= 4) return "#FFC800";
  if (level >= 2) return "#1CE400";
  return "#EEE";
}
