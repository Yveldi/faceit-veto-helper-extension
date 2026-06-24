// Inline country-flag SVGs for the content script. A content script can't load
// Vite-emitted asset files (they'd resolve against faceit.com and aren't
// web-accessible), so we inline the small (vector) flag set into the bundle and
// hand back raw SVG markup. Only the small set is bundled — it scales via CSS,
// and inlining all sizes would bloat the content script.
const flagModules = import.meta.glob(
  "/node_modules/flagpack-core/svg/s/*.svg",
  { query: "?raw", import: "default", eager: true },
);

// flagpack files the UK under GB-UKM; FACEIT/our serverPool already use that
// code, but normalise a bare GB just in case.
function fixCode(code) {
  const upper = code.toUpperCase();
  return upper === "GB" ? "GB-UKM" : upper;
}

// Raw SVG markup for an ISO code (e.g. "SE", "GB-UKM"), or null if unknown.
export function getFlagSvg(code) {
  if (typeof code !== "string" || !code) return null;
  const key = `/node_modules/flagpack-core/svg/s/${fixCode(code)}.svg`;
  return flagModules[key] ?? null;
}
