import { useEffect, useState } from "react";
import "./Flag.css";
// Raw SVG markup, not asset URLs: a content script can't load Vite-emitted
// asset files (they'd resolve against faceit.com and aren't web-accessible),
// so we inline the SVG into the bundle and render it directly.
import xkFlag from "./Kosovo.svg?raw";

// Only the small (vector) set is bundled — it scales to any size via CSS, and
// inlining all three sizes would bloat the content script by megabytes.
const flagModules = import.meta.glob(
  "/node_modules/flagpack-core/svg/s/*.svg",
  { query: "?raw", import: "default", eager: true },
);

function fixCode(code) {
  const upper = code.toUpperCase();
  return upper === "GB" ? "GB-UKM" : upper;
}

function getFlagSvg(code) {
  if (typeof code !== "string" || !code) return null;
  if (code.toLowerCase() === "xk") return xkFlag;
  const key = `/node_modules/flagpack-core/svg/s/${fixCode(code)}.svg`;
  return flagModules[key] ?? null;
}

export default function Flag({ code = "NL", size = "m", className = "" }) {
  const lowerSize = size.toLowerCase();
  const [svg, setSvg] = useState(() => getFlagSvg(code));

  useEffect(() => {
    setSvg(getFlagSvg(code));
  }, [code]);

  return (
    <div className={`flag size-${lowerSize} ${className}`.trim()}>
      {svg ? (
        <span
          className="flag-svg"
          aria-label={`Flag of ${code}`}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <p>{code}</p>
      )}
    </div>
  );
}
