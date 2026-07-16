// Pure Position Caller logic: how big the user's queue party is, and which call
// (if any) to send for the decided map.

// The user's stack size in this match, from the inline roster party ids. Party
// members share a `partyId` on the same team (the match payload carries it on
// each roster entry — see rosterProfile). Solo queue (or no party id) counts as 1.
export function partySize(teams, mainTeamIndex, selfUserId) {
  const roster = teams?.[mainTeamIndex]?.roster;
  if (!roster || !selfUserId) return 1;
  const self = roster.find((p) => p.profile?.id === selfUserId);
  const partyId = self?.profile?.partyId;
  if (!partyId) return 1;
  return roster.filter((p) => p.profile?.partyId === partyId).length;
}

// Resolve the message to send for `mapId`, or null to send nothing. Applies the
// duo fallback rule from the spec verbatim:
//   - queued as a DUO (2): send the duo message; blank duo message falls back to
//     the solo call.
//   - TRIO (3): fall back to the solo call.
//   - 4- or 5-STACK: send nothing (a full/near-full premade is on comms; auto-
//     calling would be pointless / embarrassing).
//   - SOLO (1): send the solo call.
// An off map, an unknown map (not in the pool), or an empty resolved message all
// mean "send nothing".
export function resolveCall(callsByMap, mapId, partySizeN, duoEnabled) {
  const cfg = callsByMap?.[mapId];
  if (!cfg || !cfg.on) return null;
  if (partySizeN >= 4) return null;
  const solo = (cfg.msg || "").trim();
  const duo = (cfg.duoMsg || "").trim();
  const message = duoEnabled && partySizeN === 2 ? duo || solo : solo;
  return message || null;
}
