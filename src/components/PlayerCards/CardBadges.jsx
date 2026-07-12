import { useRef, useState } from "react";
import { ESEA_SVG, FPL_SVG, hasEsea, subSvg, subTier } from "./cardHelpers";
import CornerPopover from "./CornerPopover";

// The avatar badge cluster shared by the full player card and the compact
// sub/coach card. Renders (all absolutely positioned inside a `.fvh-pc-avatarwrap`):
//   - top-left: supported-club/hub badge (purely visual, no hover)
//   - top-right: subscription badge (purely visual, no hover)
//   - bottom-left: ONE slot — FPL diamond (priority) or ESEA star — with a hover
//     popover. FACEIT hides the ESEA badge for FPL players.
// `tier` is the premium COLOUR tier read from the native roster's own badge
// (tierFromNativeBadge); when absent, memberships decide plus vs base orange.
export default function CardBadges({
  memberships,
  tier: nativeTier,
  hubBadge,
  league,
  fpl,
  mirror,
}) {
  const [cornerRect, setCornerRect] = useState(null);
  const cornerRef = useRef(null);

  const esea = hasEsea(memberships);
  const baseTier = subTier(memberships);
  // The colour tier only ever applies to premium: never recolour a plus badge,
  // and never show a badge for someone with no subscription at all.
  const tier = baseTier === "base" && nativeTier ? nativeTier : baseTier;
  const cornerKind = fpl ? "fpl" : esea ? "esea" : null;

  return (
    <>
      {hubBadge && (
        <span
          className="fvh-pc-club"
          style={{ backgroundImage: `url('${hubBadge}')` }}
        />
      )}
      {tier && (
        <span
          className="fvh-pc-sub"
          dangerouslySetInnerHTML={{ __html: subSvg(tier, 15) }}
        />
      )}
      {cornerKind && (
        <span
          ref={cornerRef}
          className={`fvh-pc-esea ${cornerKind}`}
          onMouseEnter={() => {
            if (cornerRef.current) {
              setCornerRect(cornerRef.current.getBoundingClientRect());
            }
          }}
          onMouseLeave={() => setCornerRect(null)}
          dangerouslySetInnerHTML={{
            __html: cornerKind === "fpl" ? FPL_SVG : ESEA_SVG,
          }}
        />
      )}
      {cornerKind && cornerRect && (
        <CornerPopover
          variant={cornerKind}
          league={league}
          fpl={fpl}
          anchorRect={cornerRect}
          mirror={mirror}
        />
      )}
    </>
  );
}
