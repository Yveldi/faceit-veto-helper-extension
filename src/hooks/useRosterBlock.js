import { useEffect, useMemo, useRef, useState } from "react";

// Detects FACEIT's native matchroom roster. Anchors captured from the live DOM:
//
//   Overview__Holder
//     Overview__Grid   (3 columns)
//       Overview__Column  (team A)  > Roster__Wrapper > 5x ListContentPlayer rows
//       Overview__Column  (middle: map / score / SERVER — MUST be kept)
//       Overview__Column  (team B)  > Roster__Wrapper > 5x rows
//
// We DON'T hide the whole grid (that removes the middle server/score column).
// Instead we return the TWO team columns (the ones with "membership badge"s) and
// hide only each column's `Roster__Wrapper`, mounting our team cards in its
// place. The middle column is untouched.
//
// Stable anchors, robust to FACEIT's styled-components hash churn: the
// `Overview__Grid`/`Overview__Column`/`Roster__Wrapper` component-name prefixes
// (only the `-sc-<hash>` suffix changes) and the `membership badge` data-testid.
//
// STICKY + effect keyed on a stable roster-id signature (not the players array)
// so streaming stat updates don't re-detect every tick. See
// roster-hide-must-be-sticky memory.

const BADGE = '[data-testid="membership badge"]';

function isOurs(node) {
  const el = node?.nodeType === 1 ? node : node?.parentElement;
  return !!el?.closest("#faceit-veto-helper-root, .fvh-root, .fvh-cards-mount");
}

// The nickname is the first non-numeric text node inside a player-row body.
function nicknameOf(body) {
  for (const el of body.querySelectorAll("span, div, p, a")) {
    let t = "";
    for (const c of el.childNodes) if (c.nodeType === 3) t += c.nodeValue;
    t = t.trim();
    if (t.length > 1 && t.length < 30 && !/^\d+$/.test(t)) return t;
  }
  return null;
}

// The clickable native card element that opens FACEIT's profile popup. Clicking
// the inner PlayerCardContainer (verified live) opens the native dialog, which
// is portaled to body so it works even though we've hidden the roster.
function clickTarget(body) {
  return body.querySelector('[class*="PlayerCardContainer"]') || body;
}

function findGrid() {
  for (const g of document.querySelectorAll('[class*="Overview__Grid"]')) {
    if (g.querySelectorAll(BADGE).length >= 8) return g;
  }
  return null;
}

// Build the two team slots + the player-id -> native row map.
function readRoster(players) {
  const grid = findGrid();
  if (!grid) return null;

  const teamSlots = [];
  const cardFor = {};
  const nickToRow = {};

  for (const col of grid.children) {
    if (col.querySelectorAll(BADGE).length < 2) continue; // skip middle column
    const wrapper = col.querySelector('[class*="Roster__Wrapper"]') || col;
    const bodies = [...col.querySelectorAll('[class*="ListContentPlayer__Body"]')];
    const nicks = [];
    for (const b of bodies) {
      const n = nicknameOf(b);
      if (n) {
        nicks.push(n);
        nickToRow[n.toLowerCase()] = clickTarget(b);
      }
    }
    teamSlots.push({ colEl: col, hideEl: wrapper, nicks });
  }
  if (teamSlots.length < 2) return null;

  for (const p of players || []) {
    const row = nickToRow[(p.profile?.nickname || "").toLowerCase()];
    if (row) cardFor[p.profile.id] = row;
  }

  return { blockEl: grid, teamSlots, cardFor };
}

export default function useRosterBlock(players) {
  const [result, setResult] = useState(null);
  const playersRef = useRef(players);
  playersRef.current = players;
  const cardForRef = useRef({});
  const stickyRef = useRef(null); // { blockEl, teamSlots }

  const idsKey = useMemo(
    () =>
      (players || [])
        .map((p) => p.profile.id)
        .sort()
        .join(","),
    [players],
  );

  useEffect(() => {
    stickyRef.current = null;
    cardForRef.current = {};
    setResult(null);

    let timer = null;

    const update = () => {
      const sticky = stickyRef.current;
      if (
        sticky &&
        document.contains(sticky.blockEl) &&
        sticky.teamSlots.every((s) => document.contains(s.colEl))
      ) {
        // Keep the block; just refresh the card map (rows can re-render).
        const fresh = readRoster(playersRef.current);
        if (fresh) cardForRef.current = fresh.cardFor;
        return;
      }

      const next = readRoster(playersRef.current);
      cardForRef.current = next?.cardFor ?? {};
      if (next) {
        stickyRef.current = { blockEl: next.blockEl, teamSlots: next.teamSlots };
        setResult({ teamSlots: next.teamSlots, cardForRef });
      } else if (stickyRef.current) {
        stickyRef.current = null;
        setResult(null);
      }
    };

    const observer = new MutationObserver((mutations) => {
      if (mutations.every((m) => isOurs(m.target))) return;
      clearTimeout(timer);
      timer = setTimeout(update, 150);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    update();

    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [idsKey]);

  return result;
}
