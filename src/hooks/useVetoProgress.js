import { useEffect, useRef, useState } from "react";
import { prettifyMapName } from "../utils";

// Observes the live FACEIT veto panel and tracks which maps have been banned, so
// the overlay can narrow its displayed pool IN REAL TIME as the veto plays out —
// `match/v2` is fetched only once per match, so without this the cards would show
// the full pre-veto pool until a navigation/refetch. Same DOM contract and
// MutationObserver approach as `useVetoTurn` (see AUTOVETO_SPEC.md): each option
// is a `[data-testid="matchPreference"]` row whose name is in `.middleSlot`, and
// a row that still HAS a `<button>` (enabled or disabled) is not yet banned —
// already-banned rows drop their Ban button entirely (info icon instead).
//
// Returns { banned: Set<class_name>, sawVeto: bool }:
//   - `banned` ACCUMULATES and persists for the match — a banned map stays banned
//     even after the panel disappears at veto end (the cards must not pop back to
//     the full pool). Reset only when `matchId` changes.
//   - `sawVeto` flips true only once we've actually witnessed an active veto (a
//     panel with at least one bannable map). A fully-resolved/static panel never
//     trips it, so the caller falls back to the fetched `playedMap` instead.
//
// The final PICKED map is never counted as banned: it loses its Ban button only
// when no other map still has one (anyBannable === false), so we record a ban
// only while at least one map remains bannable.
const norm = (s) => s.trim().toLowerCase();

// Mutations inside our own overlays must not retrigger a scan (the overlay
// re-renders as it narrows), or we'd loop.
function isOurs(node) {
  const el = node?.nodeType === 1 ? node : node?.parentElement;
  return !!el?.closest(".fvh-autoveto, #faceit-veto-helper-root, .fvh-root");
}

export default function useVetoProgress(matchId, mapPool) {
  const [result, setResult] = useState({ banned: new Set(), sawVeto: false });
  const bannedRef = useRef(new Set());
  const sawRef = useRef(false);
  // The observer runs outside React render; read the live pool via a ref so it
  // always matches the current Regret-Helper resolution without re-subscribing.
  const poolRef = useRef(mapPool);
  poolRef.current = mapPool;

  // Reset accumulated bans when the match changes.
  useEffect(() => {
    bannedRef.current = new Set();
    sawRef.current = false;
    setResult({ banned: new Set(), sawVeto: false });
  }, [matchId]);

  useEffect(() => {
    let timer;
    const read = () => {
      const pool = poolRef.current || [];
      // pretty map name (e.g. "Dust2") -> class_name (e.g. "de_dust2")
      const byName = new Map(pool.map((id) => [norm(prettifyMapName(id)), id]));
      const found = []; // { id, hasButton } for each map row present in the DOM
      for (const row of document.querySelectorAll(
        '[data-testid="matchPreference"]',
      )) {
        const mid = row.querySelector(".middleSlot");
        const id = mid && byName.get(norm(mid.textContent));
        if (!id) continue; // server-phase row, or a map not in our pool
        found.push({ id, hasButton: !!row.querySelector("button") });
      }
      // No map rows: server phase, or the panel is gone after veto end. Keep the
      // accumulated bans untouched (don't pop the cards back to the full pool).
      if (found.length === 0) return;

      const anyBannable = found.some((f) => f.hasButton);
      if (!anyBannable) return; // resolved/static panel — leave fetched data in charge

      sawRef.current = true;
      let changed = false;
      for (const f of found) {
        if (!f.hasButton && !bannedRef.current.has(f.id)) {
          bannedRef.current.add(f.id);
          changed = true;
        }
      }
      setResult((prev) =>
        changed || !prev.sawVeto
          ? { banned: new Set(bannedRef.current), sawVeto: true }
          : prev,
      );
    };

    const observer = new MutationObserver((mutations) => {
      if (mutations.every((m) => isOurs(m.target))) return;
      clearTimeout(timer);
      timer = setTimeout(read, 120);
    });

    read();
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
    });

    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [matchId]);

  return result;
}
