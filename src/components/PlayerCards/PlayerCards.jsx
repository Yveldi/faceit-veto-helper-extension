import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import useRosterBlock from "../../hooks/useRosterBlock";
import { getUserSummary, subscribeUserSummary } from "../../userSummary";
import {
  getEncounters,
  loadStore,
  subscribeTracking,
} from "../../playerTracking/store";
import PlayerCard from "./PlayerCard";
import "./PlayerCards.css";

// Re-render whenever a user summary (flags/cosmetics) or tracking data arrives.
function useSideDataVersion() {
  const [, setV] = useState(0);
  useEffect(() => {
    const bump = () => setV((v) => v + 1);
    const un1 = subscribeUserSummary(bump);
    const un2 = subscribeTracking(bump);
    loadStore().then(bump);
    return () => {
      un1();
      un2();
    };
  }, []);
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

function TeamColumn({
  team,
  mirror,
  statsEnabled,
  encounters,
  onOpenProfile,
}) {
  const parties = useMemo(() => deriveParties(team.roster), [team.roster]);
  return (
    <div className={`fvh-pc-col ${mirror ? "mirror" : ""}`}>
      {team.roster.map((player) => (
        <PlayerCard
          key={player.profile.id}
          player={player}
          summary={getUserSummary(player.profile.id)}
          encounter={encounters[player.profile.id]}
          mirror={mirror}
          statsEnabled={statsEnabled}
          party={parties[player.profile.id]}
          onOpenProfile={(rect) => onOpenProfile(player.profile.id, rect, mirror)}
        />
      ))}
    </div>
  );
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
export default function PlayerCards({ data, statsEnabled }) {
  useSideDataVersion();

  const players = useMemo(
    () => (data.teams ? data.teams.flatMap((t) => t.roster) : []),
    [data.teams],
  );
  const block = useRosterBlock(players);
  const mountsRef = useRef([]); // [{ hideEl, mountNode }]
  const [mounts, setMounts] = useState([]); // [{ mountNode, teamIndex, mirror }]

  // Set up per-team mounts: hide each native Roster__Wrapper and create a mount
  // inside its column. Cleanup restores the native rosters.
  useEffect(() => {
    if (!block?.teamSlots || !data.teams) return;

    const created = [];
    block.teamSlots.forEach((slot, i) => {
      slot.hideEl.classList.add("fvh-cards-hidden");
      const mountNode = document.createElement("div");
      mountNode.className = "fvh-cards-mount fvh-root";
      // Place our mount right after the hidden wrapper, inside the same column.
      slot.colEl.insertBefore(mountNode, slot.hideEl.nextSibling);
      const teamIndex = alignTeamIndex(slot, data.teams);
      created.push({ hideEl: slot.hideEl, mountNode, teamIndex, mirror: i === 1 });
    });
    mountsRef.current = created;
    setMounts(created.filter((c) => c.teamIndex >= 0));

    return () => {
      for (const c of created) {
        c.hideEl.classList.remove("fvh-cards-hidden");
        c.mountNode.remove();
      }
      mountsRef.current = [];
      setMounts([]);
    };
  }, [block?.teamSlots, data.teams]);

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
    const el = cardForRef?.current?.[playerId];
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
    el.click();

    // FACEIT anchors the popup to the native card via a Base UI popover, but our
    // card is display:none (no rect) so it lands at 0,0. Reposition it to our
    // card's OUTER edge (left team -> left, right team -> right, small gap),
    // vertically centred on the card.
    const place = (tries = 0) => {
      // Bail if a newer click superseded this one.
      if (openRef.current.playerId !== playerId) return;
      const pop = profilePopups()[0];
      if (!pop) {
        if (tries < 12) setTimeout(() => place(tries + 1), 40);
        return;
      }
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
      openRef.current.node = pop;
    };
    place();
  };

  if (!block?.teamSlots || mounts.length === 0 || !data.teams) return null;

  return (
    <>
      {mounts.map((m, i) =>
        createPortal(
          <TeamColumn
            team={data.teams[m.teamIndex]}
            mirror={m.mirror}
            statsEnabled={statsEnabled}
            encounters={encounters}
            onOpenProfile={openProfile}
          />,
          m.mountNode,
          i,
        ),
      )}
    </>
  );
}
