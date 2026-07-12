import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import useRosterBlock from "../../hooks/useRosterBlock";
import { getUserSummary, subscribeUserSummary } from "../../userSummary";
import { getTeamLeague, subscribeTeamLeague } from "../../teamLeagues";
import { getFpl, subscribeFpl } from "../../fplStatus";
import {
  getEncounters,
  loadStore,
  subscribeTracking,
} from "../../playerTracking/store";
import PlayerCard from "./PlayerCard";
import RoleCard from "./RoleCard";
import { ACTIONS, classifyStatus, tierFromNativeBadge } from "./cardHelpers";
import "./PlayerCards.css";

// Re-render whenever a user summary (flags/cosmetics) or tracking data arrives.
function useSideDataVersion() {
  const [, setV] = useState(0);
  useEffect(() => {
    const bump = () => setV((v) => v + 1);
    const un1 = subscribeUserSummary(bump);
    const un2 = subscribeTracking(bump);
    const un3 = subscribeTeamLeague(bump);
    const un4 = subscribeFpl(bump);
    loadStore().then(bump);
    return () => {
      un1();
      un2();
      un3();
      un4();
    };
  }, []);
}

// Whether two guid->string maps are equal (so we only re-render on a real
// change, not on every native-roster mutation).
function sameStringMap(a, b) {
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  return ak.every((k) => a[k] === b[k]);
}

// Live per-player info read straight from FACEIT's OWN native roster rows. We
// hide those rows with display:none but never remove them, so FACEIT keeps
// updating them. One observer, two extractions, each mapped to a player by guid
// via the cardFor row map:
//   - statuses: match-outcome tags (LEAVER / AFK / KICKED / ...): when the
//     match ends/cancels FACEIT stamps a `styles__Status` tag onto the row,
//     classified into a design kind (afk|kicked|left) via classifyStatus. Free +
//     real-time; no re-fetch of match/v4 (FACEIT pushes it over its websocket).
//   - tiers: the premium COLOUR tier (gold/.../legend) from the row's own
//     subscription badge SVG (tierFromNativeBadge). No fetchable/piggybackable
//     API carries it, but FACEIT renders it into the hidden rows for logged-in
//     viewers. null/absent = base orange (memberships decide plus vs base).
function useNativeRosterInfo(block, players) {
  const [info, setInfo] = useState({ statuses: {}, tiers: {} });
  useEffect(() => {
    if (!block?.teamSlots) return;
    const rescan = () => {
      const cf = block.cardForRef?.current || {};
      const statuses = {};
      const tiers = {};
      for (const guid in cf) {
        const body = cf[guid]?.body;
        const el = body?.querySelector('[class*="styles__Status"]');
        const kind = classifyStatus(el?.textContent?.trim());
        if (kind) statuses[guid] = kind;
        const tier = tierFromNativeBadge(body);
        if (tier) tiers[guid] = tier;
      }
      setInfo((prev) =>
        sameStringMap(prev.statuses, statuses) && sameStringMap(prev.tiers, tiers)
          ? prev
          : { statuses, tiers },
      );
    };
    rescan(); // `players` in the deps re-runs this once cardFor is populated,
    // covering an already-finished match opened fresh (its tags are present
    // before any further mutation would fire the observer).
    const obs = new MutationObserver(rescan);
    for (const s of block.teamSlots) {
      obs.observe(s.colEl, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }
    return () => obs.disconnect();
  }, [block, players]);
  return info;
}

// Party grouping: a card gets a downward-connecting bracket ONLY if the NEXT
// player in the same team shares its party id. So a duo draws one bracket (on
// the top member, reaching down to the bottom member); a solo draws none. This
// is what stops the bracket bleeding into the following non-party card.
const PARTY_COLORS = ["#ff9d3c", "#8a5bff", "#39c0d6", "#f5c542", "#6fe09a"];
function deriveParties(roster) {
  // Assign a stable colour per multi-person party.
  const counts = new Map();
  for (const p of roster) {
    const pid = p.profile?.partyId;
    if (pid == null) continue;
    counts.set(pid, (counts.get(pid) || 0) + 1);
  }
  const colorFor = new Map();
  let ci = 0;
  for (const [pid, n] of counts) {
    if (n >= 2) colorFor.set(pid, PARTY_COLORS[ci++ % PARTY_COLORS.length]);
  }
  const out = {};
  for (let i = 0; i < roster.length; i++) {
    const pid = roster[i].profile?.partyId;
    const next = roster[i + 1]?.profile?.partyId;
    if (pid != null && colorFor.has(pid) && pid === next) {
      out[roster[i].profile.id] = { bracket: true, color: colorFor.get(pid) };
    }
  }
  return out;
}

// The profile-popup presentation nodes FACEIT portals to body (Base UI popover).
function profilePopups() {
  return [...document.querySelectorAll('[role="presentation"][data-side]')].filter(
    (n) => /MATCHES|WIN RATE|Go to profile/i.test(n.innerText),
  );
}
// Close any open profile popup. Synthetic outside-click/Escape don't dismiss the
// Base UI popover, but removing its node does (verified live) and is clean —
// FACEIT re-creates a fresh node on the next open.
function closeProfilePopups() {
  profilePopups().forEach((n) => n.remove());
}

// Orange section header (design's labeled divider). Only shown in rooms that
// actually have substitutes/coaches, so the common matchmaking layout is
// unchanged.
function SectionHeader({ label }) {
  return (
    <div className="fvh-pc-section">
      <span className="fvh-pc-section-lbl">{label}</span>
      <span className="fvh-pc-section-line" />
    </div>
  );
}

function TeamColumn({
  team,
  mirror,
  statsEnabled,
  encounters,
  statuses,
  tiers,
  selfUserId,
  onOpenProfile,
  onAction,
  nativeActions,
}) {
  const parties = useMemo(() => deriveParties(team.roster), [team.roster]);
  const subs = team.substitutes ?? [];
  const coaches = team.coaches ?? [];
  // Group with PLAYERS / SUBSTITUTES / COACH headers only when there's actually
  // a non-player group (championship/coached rooms); otherwise render the bare
  // starter list exactly as before.
  const grouped = subs.length > 0 || coaches.length > 0;
  const roleCard = (player, role) => (
    <RoleCard
      key={player.profile.id}
      player={player}
      summary={getUserSummary(player.profile.id)}
      league={getTeamLeague(player.profile.id)}
      fpl={getFpl(player.profile.id)}
      encounter={encounters[player.profile.id]}
      status={statuses[player.profile.id]}
      tier={tiers[player.profile.id]}
      role={role}
      mirror={mirror}
      onOpenProfile={(rect) => onOpenProfile(player.profile.id, rect, mirror)}
    />
  );
  return (
    <div className={`fvh-pc-col ${mirror ? "mirror" : ""}`}>
      {grouped && <SectionHeader label="PLAYERS" />}
      {team.roster.map((player) => (
        <PlayerCard
          key={player.profile.id}
          player={player}
          summary={getUserSummary(player.profile.id)}
          league={getTeamLeague(player.profile.id)}
          fpl={getFpl(player.profile.id)}
          encounter={encounters[player.profile.id]}
          status={statuses[player.profile.id]}
          tier={tiers[player.profile.id]}
          mirror={mirror}
          statsEnabled={statsEnabled}
          isSelf={!!selfUserId && player.profile.id === selfUserId}
          party={parties[player.profile.id]}
          onOpenProfile={(rect) => onOpenProfile(player.profile.id, rect, mirror)}
          onAction={(index) => onAction(player.profile.id, index)}
          getActions={() => nativeActions(player.profile.id)}
        />
      ))}
      {subs.length > 0 && <SectionHeader label="SUBSTITUTES" />}
      {subs.map((player) => roleCard(player, "sub"))}
      {coaches.length > 0 && <SectionHeader label="COACH" />}
      {coaches.map((player) => roleCard(player, "coach"))}
    </div>
  );
}

// A team built purely from the native DOM rows (nickname + avatar), shown
// INSTANTLY before match/v2 returns. elo/level/party/cosmetics/stats are unknown
// yet, so the card renders name + avatar with a skeleton stats band and no elo
// (they overlay in once the real team data arrives). `id` is the nickname as a
// stand-in guid — good enough to key/render; the real guid lands with the fetch.
function skeletonTeamFromSlot(slot) {
  return {
    name: "",
    roster: slot.domPlayers.map((d) => ({
      profile: {
        id: d.nickname,
        nickname: d.nickname,
        avatar: d.avatar,
        games: { cs2: { faceit_elo: 0 } },
        memberships: [],
        skillLevel: null,
        partyId: null,
      },
      winrate: {},
      stats: {},
      card: null,
      loaded: false,
      ratingEstimated: false,
    })),
  };
}

// The team to render into a given native slot: the aligned real data.teams team
// once loaded, else the instant DOM skeleton for that slot.
function resolveTeam(slot, teams) {
  if (teams) {
    const ti = alignTeamIndex(slot, teams);
    if (ti >= 0) return teams[ti];
  }
  return skeletonTeamFromSlot(slot);
}

// Align a native team column (by its nicknames) to one of our data.teams.
function alignTeamIndex(slot, teams) {
  const set = new Set(slot.nicks.map((n) => n.toLowerCase()));
  let best = -1;
  let bestScore = -1;
  teams.forEach((t, ti) => {
    const score = t.roster.filter((p) =>
      set.has((p.profile.nickname || "").toLowerCase()),
    ).length;
    if (score > bestScore) {
      bestScore = score;
      best = ti;
    }
  });
  return bestScore > 0 ? best : -1;
}

// Feature component: hides each native team roster (keeping the middle
// map/score/server column) and portals our team cards into each column.
export default function PlayerCards({ matchId, data, selfUserId, statsEnabled }) {
  useSideDataVersion();

  // Include substitutes + coaches so the guid -> native-row map (`cardFor`, for
  // click-to-open-profile) and the encounters lookup cover them too.
  const players = useMemo(
    () =>
      data.teams
        ? data.teams.flatMap((t) => [
            ...t.roster,
            ...(t.substitutes ?? []),
            ...(t.coaches ?? []),
          ])
        : [],
    [data.teams],
  );
  const block = useRosterBlock(matchId, players);
  const { statuses, tiers } = useNativeRosterInfo(block, players);
  const mountsRef = useRef([]); // [{ hideEl, mountNode }]
  const [mounts, setMounts] = useState([]); // [{ mountNode, slot, mirror }]

  // Set up per-team mounts as soon as the roster is DETECTED — NOT gated on
  // match/v2 (data.teams). Hide each native Roster__Wrapper and create a mount
  // inside its column; each mount renders that slot's cards from data.teams if
  // loaded, else the instant DOM skeleton. Cleanup restores the native rosters.
  useEffect(() => {
    if (!block?.teamSlots) return;

    const created = [];
    block.teamSlots.forEach((slot, i) => {
      slot.hideEl.classList.add("fvh-cards-hidden");
      const mountNode = document.createElement("div");
      mountNode.className = "fvh-cards-mount fvh-root";
      // Place our mount right after the hidden wrapper, inside the same column.
      slot.colEl.insertBefore(mountNode, slot.hideEl.nextSibling);
      created.push({ hideEl: slot.hideEl, mountNode, slot, mirror: i === 1 });
    });
    mountsRef.current = created;
    setMounts(created);

    return () => {
      for (const c of created) {
        c.hideEl.classList.remove("fvh-cards-hidden");
        c.mountNode.remove();
      }
      mountsRef.current = [];
      setMounts([]);
    };
  }, [block?.teamSlots]);

  // Resolve each mount's team (real once loaded, else DOM skeleton). Memoized so
  // an unrelated re-render doesn't churn a fresh skeleton object every time;
  // recomputes when the mounts change or data streams in.
  const resolvedTeams = useMemo(
    () => mounts.map((m) => resolveTeam(m.slot, data.teams)),
    [mounts, data.teams],
  );

  // Full safety cleanup on unmount / feature-off.
  useEffect(() => {
    return () => {
      document
        .querySelectorAll(".fvh-cards-hidden")
        .forEach((el) => el.classList.remove("fvh-cards-hidden"));
      mountsRef.current.forEach((c) => c.mountNode.remove());
      mountsRef.current = [];
    };
  }, []);

  const encounters = useMemo(
    () => getEncounters(players.map((p) => p.profile.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [players],
  );

  // Shared profile-popup state across both team columns (only one open at a
  // time). Clicking a player opens FACEIT's own popup by proxy-clicking the
  // hidden native card; we then reposition it (see below).
  const openRef = useRef({ playerId: null, node: null });

  const openProfile = (playerId, cardRect, mirror) => {
    const cardForRef = block?.cardForRef;
    const el = cardForRef?.current?.[playerId]?.card;
    if (!el) return;

    const st = openRef.current;
    const sameStillOpen =
      st.playerId === playerId && st.node && document.contains(st.node);

    // Always close whatever profile popup is currently open FIRST (ours or a
    // stray), in order — this is what stops the new popup landing at 0,0 when
    // switching players, and it makes a second click on the SAME player a
    // toggle-off (FACEIT keeps re-rendering otherwise, causing the teleport).
    closeProfilePopups();
    if (sameStillOpen) {
      openRef.current = { playerId: null, node: null };
      return;
    }

    openRef.current = { playerId, node: null };

    // FACEIT anchors the popup to the native card via a Base UI popover, but our
    // card is display:none (no rect) so it lands at 0,0 — which used to flash in
    // the top-left corner for a frame before we moved it. Reposition it to our
    // card's OUTER edge (left team -> left, right team -> right, small gap),
    // vertically centred on the card.
    const position = (pop) => {
      const rect = pop.getBoundingClientRect();
      const W = rect.width || 288;
      const H = rect.height || 483;
      const gap = 12;
      const vCenter = cardRect.top + cardRect.height / 2;
      const top = Math.max(8, Math.min(vCenter - H / 2, window.innerHeight - H - 8));
      let left = mirror ? cardRect.right + gap : cardRect.left - gap - W;
      left = Math.max(8, Math.min(left, window.innerWidth - W - 8));

      pop.style.position = "fixed";
      pop.style.left = `${left}px`;
      pop.style.top = `${top}px`;
      pop.style.transform = "none";
      pop.style.zIndex = "2147483000";
      pop.style.visibility = "visible";
      openRef.current.node = pop;
    };

    // Catch the popup the instant FACEIT adds it (a MutationObserver callback
    // fires before the browser paints), HIDE it there so it never paints at 0,0,
    // then position + reveal it on the next frame once it has real dimensions.
    // This is what removes the top-left-corner jitter.
    let placed = false;
    const obs = new MutationObserver(() => {
      if (placed || openRef.current.playerId !== playerId) return;
      const pop = profilePopups()[0];
      if (!pop) return;
      placed = true;
      obs.disconnect();
      pop.style.visibility = "hidden";
      requestAnimationFrame(() => {
        if (openRef.current.playerId === playerId) position(pop);
      });
    });
    obs.observe(document.body, { childList: true, subtree: true });
    // Stop watching after a beat if the popup never showed (e.g. no permission).
    setTimeout(() => obs.disconnect(), 2000);

    el.click();
  };

  // The native action buttons currently present for a player. FACEIT only renders
  // Like/Block/Report while they're usable (a short window during & after the
  // match); outside it there's no `HoverReportOptions` container / no buttons. We
  // MIRROR that (PLAYER_CARDS_SPEC §9.4): return only the ACTIONS whose native
  // button actually exists and is enabled, so our buttons never show when they'd
  // do nothing. Read fresh (it changes with match state) — callers read on hover.
  const nativeActions = (playerId) => {
    const body = block?.cardForRef?.current?.[playerId]?.body;
    if (!body) return [];
    const container = body.querySelector('[class*="HoverReportOptions"]');
    if (!container) return [];
    const btns = container.querySelectorAll("button");
    return ACTIONS.filter((a) => {
      const b = btns[a.index];
      return b && !b.disabled;
    });
  };

  // Proxy-click the native Like (0) / Block (1) / Report (2) button for a player,
  // reusing FACEIT's own action popups (see PLAYER_CARDS_SPEC §9). Re-resolve the
  // native buttons at click time — a FACEIT re-render can invalidate references.
  const doAction = (playerId, index) => {
    const body = block?.cardForRef?.current?.[playerId]?.body;
    if (!body) return;
    const container = body.querySelector('[class*="HoverReportOptions"]');
    const btn = container?.querySelectorAll("button")[index];
    if (btn) btn.click();
  };

  if (!block?.teamSlots || mounts.length === 0) return null;

  return (
    <>
      {mounts.map((m, i) =>
        createPortal(
          <TeamColumn
            team={resolvedTeams[i]}
            mirror={m.mirror}
            statsEnabled={statsEnabled}
            encounters={encounters}
            statuses={statuses}
            tiers={tiers}
            selfUserId={selfUserId}
            onOpenProfile={openProfile}
            onAction={doAction}
            nativeActions={nativeActions}
          />,
          m.mountNode,
          i,
        ),
      )}
    </>
  );
}
