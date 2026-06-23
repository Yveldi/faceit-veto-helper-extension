// ============================================================================
// stats.js — pure rating/probability math.
//
// All functions here are deterministic and side-effect free. The numbers are
// identical to the original web app; only the packaging is smaller. The raw
// per-player input shape (from getPlayerStats in utils.js) is:
//   { de_mirage: [rating, winRate, matchCount], de_nuke: [...], ... }
// Only maps the player has recent rated history on appear — a missing map
// entry means "no data", not zero.
// ============================================================================

import { calculatePlayerWinrate } from "./utils";

// Faceit elo for a profile, or 0 if the player has no cs2 stats.
function playerElo(profile) {
  return profile.games?.cs2?.faceit_elo ?? 0;
}

// Collapse a player's raw stats into a per-map score (higher = better).
export function computePlayerWinrate(stats) {
  const result = {};
  for (const [map, [rating, winRate, count]] of Object.entries(stats)) {
    result[map] = calculatePlayerWinrate(rating, winRate, count);
  }
  return result;
}

// Roll a team's per-player scores up into one per-map team score, weighting
// each player's contribution by their elo (so a higher-elo player's read on a
// map counts for more). Players with no data on a map are skipped.
export function computeTeamScores(roster, mapPool) {
  const totalElo = roster.reduce((sum, p) => sum + playerElo(p.profile), 0);
  const scoreByMap = {};
  for (const map of mapPool) {
    let weighted = 0;
    for (const p of roster) {
      const wr = p.winrate[map];
      if (typeof wr === "number") weighted += wr * playerElo(p.profile);
    }
    scoreByMap[map] = totalElo > 0 ? Math.floor(weighted / totalElo) : 0;
  }
  return { scoreByMap, totalElo };
}

// Team summaries for the WIN-PROBABILITY display while data is still streaming
// in. Not-yet-loaded players are stood in for by an "average player" (the mean
// elo + mean per-map score of everyone loaded so far), so the two teams stay
// balanced and the shown % starts believable (~50%) and converges to the exact
// value instead of spiking to 150-200% while one team is half-empty. Once every
// player is loaded there are no stand-ins, so this returns the real summaries
// unchanged. `teams` rosters carry a `loaded` flag (see useMatchData).
export function estimateWinSummaries(teams, mapPool) {
  const loaded = teams.flatMap((t) => t.roster).filter((p) => p.loaded);
  // Nothing loaded yet: no basis to estimate (the UI shows placeholders here).
  if (loaded.length === 0) {
    return teams.map((t) => ({ ...t, ...computeTeamScores(t.roster, mapPool) }));
  }

  const meanElo = Math.round(
    loaded.reduce((s, p) => s + playerElo(p.profile), 0) / loaded.length,
  );
  const meanByMap = {};
  for (const map of mapPool) {
    const vals = loaded
      .map((p) => p.winrate[map])
      .filter((v) => typeof v === "number");
    meanByMap[map] = vals.length
      ? vals.reduce((a, b) => a + b, 0) / vals.length
      : 0;
  }
  const average = {
    profile: { games: { cs2: { faceit_elo: meanElo } } },
    winrate: meanByMap,
  };

  return teams.map((t) => {
    const roster = t.roster.map((p) => (p.loaded ? p : average));
    return { ...t, ...computeTeamScores(roster, mapPool) };
  });
}

// Per-map win probability (%) for `mainTeam` against `otherTeam`. Identical to
// the old BanSuggestion math: an elo-derived base win rate, doubled as a
// multiplier, times the main team's share of the two teams' combined map score.
export function computeMapWinProbabilities({ mainTeam, otherTeam, mapPool }) {
  const totalElo = mainTeam.totalElo + otherTeam.totalElo;
  const baseWinrate = totalElo > 0 ? (mainTeam.totalElo / totalElo) * 2 : 1;

  const probabilities = {};
  for (const map of mapPool) {
    const combined = mainTeam.scoreByMap[map] + otherTeam.scoreByMap[map];
    const odds =
      combined > 0 ? (mainTeam.scoreByMap[map] / combined) * baseWinrate : 0;
    probabilities[map] = Number((odds * 100).toFixed(0));
  }
  return probabilities;
}
