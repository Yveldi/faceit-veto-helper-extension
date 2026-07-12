import { useEffect, useRef, useState } from "react";

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
// STICKY + effect keyed on the matchId (NOT the players array, and not a
// player-id signature) so streaming stat updates — and match/v2 arriving — never
// re-detect / momentarily un-hide the native roster. See
// roster-hide-must-be-sticky memory. The card map (guid -> native row) is
// refreshed out-of-band as players load (a separate effect), since detection no
// longer re-runs when they do.
//
// INSTANT SWAP: each detected slot also carries a `domPlayers` list scraped
// straight from the native rows (nickname + avatar). PlayerCards mounts our
// cards from that immediately — the native roster is hidden the frame the grid
// is fully rendered, without waiting for match/v2. Real elo/level/stats overlay
// in when the fetch returns.

// A player row. We anchor on the ROWS (which render with the username first),
// NOT on the membership badges — those are part of the late-loading profile data
// (sub / ESEA badges), so waiting for `>= 8` badges meant waiting for FACEIT to
// finish loading everything before we swapped. Rows appear as soon as usernames
// do, which is the earliest we can meaningfully render our cards.
const BODY = '[class*="ListContentPlayer__Body"]';

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

// The player's avatar URL straight from the native row's <img>, so our instant
// DOM skeleton card can show the real avatar before match/v2 returns. FACEIT
// renders it as an <img>; inline SVG placeholders (data: URIs) are ignored so
// the card falls back to its own empty-avatar styling instead.
function scrapeAvatar(body) {
  const img = body.querySelector("img");
  const src = img?.getAttribute("src") || img?.src || "";
  return /^https?:/i.test(src) ? src : null;
}

// The team columns of a grid: those holding >= 2 player rows (the middle
// map/score/server column has none). Anchoring on rows, not badges, so we match
// as soon as the roster renders — before elo/level/avatar/badges stream in.
function teamColumnsOf(grid) {
  return [...grid.children].filter(
    (col) => col.querySelectorAll(BODY).length >= 2,
  );
}

// How many sample points inside the grid actually hit-test to the grid itself
// (i.e. it's the layer on top there). FACEIT can render the SAME match's roster
// in TWO stacked, both-CSS-visible layers: when a room is opened as a
// ContextualView overlay (e.g. via a profile's "MATCHROOM" button before the
// match starts), a base-page `Overview__Grid` sits UNDER an overlay
// `Overview__Grid` inside `ContextualView__Content`. `offsetParent`/`display`/
// `visibility` all pass for both, so the only reliable way to tell which one the
// user actually sees is to hit-test: the occluded layer owns 0 of its own
// centre points. Without this we'd hide/mount into the hidden base layer while
// the untouched overlay roster stays on screen — the cards never appear.
function centerOwnership(grid) {
  const r = grid.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return 0;
  const pts = [
    [0.5, 0.15],
    [0.5, 0.5],
    [0.25, 0.3],
    [0.75, 0.3],
  ];
  let owned = 0;
  for (const [fx, fy] of pts) {
    const el = document.elementFromPoint(r.left + r.width * fx, r.top + r.height * fy);
    if (el && grid.contains(el)) owned++;
  }
  return owned;
}

function gridCandidates() {
  const out = [];
  for (const g of document.querySelectorAll('[class*="Overview__Grid"]')) {
    if (teamColumnsOf(g).length >= 2) out.push(g);
  }
  return out;
}

function findGrid() {
  const candidates = gridCandidates();
  if (candidates.length <= 1) return candidates[0] ?? null;
  // Multiple roster grids (stacked layers) — pick the one actually on top at its
  // own centre. Fall back to document order if hit-testing is inconclusive
  // (e.g. all momentarily occluded or off-screen).
  let best = candidates[0];
  let bestOwned = -1;
  for (const g of candidates) {
    const owned = centerOwnership(g);
    if (owned > bestOwned) {
      bestOwned = owned;
      best = g;
    }
  }
  return bestOwned > 0 ? best : candidates[0];
}

// Build the two team slots + the player-id -> native row map.
function readRoster(players) {
  const grid = findGrid();
  if (!grid) return null;

  const teamSlots = [];
  const cardFor = {};
  const nickToRow = {};

  for (const col of teamColumnsOf(grid)) {
    const wrapper = col.querySelector('[class*="Roster__Wrapper"]') || col;
    const bodies = [...col.querySelectorAll(BODY)];
    const domPlayers = [];
    for (const b of bodies) {
      const n = nicknameOf(b);
      if (n) {
        domPlayers.push({ nickname: n, avatar: scrapeAvatar(b) });
        // Keep BOTH the profile click target (PlayerCardContainer) and the row
        // body — the body is where the native Like/Block/Report buttons live, and
        // we proxy-click them from our own hover action buttons (see PLAYER_CARDS_SPEC §9).
        nickToRow[n.toLowerCase()] = { card: clickTarget(b), body: b };
      }
    }
    // Only trust a column once at least one username has rendered — otherwise
    // we'd hide the native roster and show a blank column for a frame.
    if (domPlayers.length > 0) {
      teamSlots.push({
        colEl: col,
        hideEl: wrapper,
        nicks: domPlayers.map((d) => d.nickname),
        domPlayers,
      });
    }
  }
  if (teamSlots.length < 2) return null;

  for (const p of players || []) {
    const row = nickToRow[(p.profile?.nickname || "").toLowerCase()];
    if (row) cardFor[p.profile.id] = row;
  }

  return { blockEl: grid, teamSlots, cardFor };
}

export default function useRosterBlock(matchId, players) {
  const [result, setResult] = useState(null);
  const playersRef = useRef(players);
  playersRef.current = players;
  const cardForRef = useRef({});
  const stickyRef = useRef(null); // { blockEl, teamSlots }

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
        sticky.teamSlots.every((s) => document.contains(s.colEl)) &&
        // If a SECOND roster grid has since appeared and now occludes the one we
        // locked onto (a ContextualView overlay mounting over the base layer, or
        // vice-versa), drop stickiness so we re-detect and switch to the visible
        // layer. Only pay for the hit-test when a rival grid actually exists —
        // the common single-grid room never reaches this.
        !(gridCandidates().length > 1 && centerOwnership(sticky.blockEl) === 0)
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
        // Hide the native rosters SYNCHRONOUSLY, right here — so the incomplete
        // native cards (username/elo/party only) never get a frame on screen.
        // React then mounts our skeleton into the freed columns a commit later
        // (PlayercCards' mount effect re-applies this idempotently and owns the
        // cleanup that restores the native roster).
        for (const s of next.teamSlots) s.hideEl.classList.add("fvh-cards-hidden");
        setResult({ teamSlots: next.teamSlots, cardForRef });
      } else if (stickyRef.current) {
        stickyRef.current = null;
        setResult(null);
      }
    };

    const observer = new MutationObserver((mutations) => {
      if (mutations.every((m) => isOurs(m.target))) return;
      // Until we've locked onto this room's roster, run SYNCHRONOUSLY (once per
      // mutation batch) and hide the native rows the same tick they appear — no
      // rAF / React-commit wait — so the incomplete native cards never paint.
      // Once sticky, coalesce refreshes on a debounce.
      if (!stickyRef.current) {
        update();
        return;
      }
      clearTimeout(timer);
      timer = setTimeout(update, 150);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    update();

    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [matchId]);

  // Refresh the guid -> native-row map when players load. Detection is keyed on
  // matchId (so it doesn't re-run / un-hide when data streams in), which means it
  // won't rebuild `cardFor` on its own — so do it here off the still-present
  // native rows. cardForRef is read at click time, so no re-render is needed.
  useEffect(() => {
    if (!stickyRef.current) return;
    const fresh = readRoster(players);
    if (fresh) cardForRef.current = fresh.cardFor;
  }, [players]);

  return result;
}
