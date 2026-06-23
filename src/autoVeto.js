// ============================================================================
// autoVeto.js — pure decision logic for the auto server & map veto.
//
// No DOM, no React, no side effects: given the current veto turn and the user's
// preferences, decide which option to ban. The component (AutoVeto.jsx) handles
// detection, the countdown, and the actual click; this file only chooses.
//
// Win value = "higher is better" for a map, on a 0..100-ish scale. Source chain
// (see AUTOVETO_SPEC.md): this match's win probability, else the user's cached
// own per-map win rate, else unknown. computeWinValues builds that lookup.
// ============================================================================

import { defaultMapPool } from "./utils";
import { computeTeamScores, computeMapWinProbabilities } from "./stats";
import mapPool from "./mapPool.json";
import serverPool from "./serverPool.json";

// Display name (as shown in the veto row) -> FACEIT map id (de_dust2, ...).
const NAME_TO_ID = Object.fromEntries(
  mapPool.map((m) => [m.name.toLowerCase(), m.id]),
);

// Build a { mapId: winValue } lookup. Match win probabilities take priority;
// the user's cached own per-map win rate is the fallback. A genuine match prob
// of 0 (no team data on a map) does not clobber a usable cached value.
export function computeWinValues(data, selfStats) {
  const values = {};

  if (selfStats) {
    for (const [id, entry] of Object.entries(selfStats)) {
      if (Array.isArray(entry) && typeof entry[1] === "number") {
        values[id] = entry[1];
      }
    }
  }

  // Only trust live match probabilities once every player is loaded; mid-stream
  // the per-map scores are partial and would mislead the ban choice. Until then
  // the cached self win rates above stand in.
  if (data?.teams && data.ready) {
    const summaries = data.teams.map((t) => ({
      ...t,
      ...computeTeamScores(t.roster, data.mapPool),
    }));
    const other = data.mainTeamIndex === 0 ? 1 : 0;
    const probs = computeMapWinProbabilities({
      mainTeam: summaries[data.mainTeamIndex],
      otherTeam: summaries[other],
      mapPool: data.mapPool,
    });
    for (const [id, p] of Object.entries(probs)) {
      values[id] = p > 0 ? p : values[id] ?? p;
    }
  }

  return values;
}

// Pick the option to ban for the current turn, or null if none applies.
export function chooseBan(turn, opts) {
  if (!turn.options.length) return null;
  if (turn.phase === "server") return chooseServer(turn.options, opts.serverOrder);
  return chooseMap(turn.options, opts);
}

// Servers: a single ordered preference (top = ban first, bottom = keep). Ban the
// available server highest in that order. Servers not in the list (or none set)
// fall back to the shipped pool order; anything still unranked is kept last.
function chooseServer(options, serverOrder) {
  const order = serverOrder?.length ? serverOrder : serverPool.map((s) => s.name);
  const lower = order.map((n) => n.toLowerCase());
  const rank = (name) => {
    const i = lower.indexOf(name.toLowerCase());
    return i === -1 ? Infinity : i;
  };
  let best = null;
  let bestRank = Infinity;
  for (const o of options) {
    const r = rank(o.name);
    if (best === null || r < bestRank) {
      best = o;
      bestRank = r;
    }
  }
  return best;
}

// Order the dynamic (decide-by-win-odds) maps: lowest win value banned first.
// Maps with a known value sort ahead of unknown ones; ties and unknowns keep
// the user's configured order.
function orderDynamic(dynamicIds, configOrder, winValues) {
  const cfg = configOrder?.length ? configOrder : defaultMapPool;
  const cfgIndex = (id) => {
    const i = cfg.indexOf(id);
    return i === -1 ? 999 : i;
  };
  return [...dynamicIds].sort((a, b) => {
    const wa = winValues[a];
    const wb = winValues[b];
    const ka = typeof wa === "number";
    const kb = typeof wb === "number";
    if (ka && kb) return wa - wb || cfgIndex(a) - cfgIndex(b);
    if (ka) return -1;
    if (kb) return 1;
    return cfgIndex(a) - cfgIndex(b);
  });
}

// Maps: build the ban sequence (ban-first list, then dynamic-by-win-odds, then
// ban-last list with the very bottom most protected) and ban the first available
// map. Two independent win-odds overrides can adjust that pick, each by a points
// GAP (win-probability difference), not an absolute threshold:
//   - "Don't protect losing maps": a ban-last map loses its protection if some
//     other available map's win odds beat it by at least `protectGap`.
//   - "Remove worst maps first": if the worst still-bannable (unprotected) map is
//     below the ordered pick by at least `worstFirstGap`, ban it first instead.
function chooseMap(options, opts) {
  const {
    winValues,
    mapFirst,
    mapDynamic,
    mapLast,
    worstFirstEnabled,
    worstFirstGap,
    protectEnabled,
    protectGap,
  } = opts;

  const opt = options
    .map((o) => ({ ...o, id: NAME_TO_ID[o.name.toLowerCase()] }))
    .filter((o) => o.id);
  if (!opt.length) return null;

  const availableIds = opt.map((o) => o.id);
  const byId = Object.fromEntries(opt.map((o) => [o.id, o]));
  const firstSet = new Set(mapFirst ?? []);

  // Override #2: a ban-last map loses its protection when another available map
  // beats its win odds by >= protectGap (so it drops into the dynamic group).
  // Only banning it when a clearly BETTER map exists avoids sacrificing a kept
  // map just because it's low in absolute terms while every option is equally bad.
  const lastSet = new Set((mapLast ?? []).filter((id) => availableIds.includes(id)));
  if (protectEnabled) {
    for (const id of [...lastSet]) {
      const wv = winValues[id];
      if (typeof wv !== "number") continue;
      let bestOther = -Infinity;
      for (const other of availableIds) {
        if (other === id) continue;
        const ov = winValues[other];
        if (typeof ov === "number" && ov > bestOther) bestOther = ov;
      }
      if (bestOther > -Infinity && bestOther - wv >= protectGap) lastSet.delete(id);
    }
  }

  const first = (mapFirst ?? []).filter(
    (id) => availableIds.includes(id) && !lastSet.has(id),
  );
  const last = (mapLast ?? []).filter((id) => lastSet.has(id));
  const dynamicIds = availableIds.filter(
    (id) => !firstSet.has(id) && !lastSet.has(id),
  );
  const dynamic = orderDynamic(dynamicIds, mapDynamic, winValues);

  const sequence = [...first, ...dynamic, ...last];
  // Safety net: never strand an available map out of the sequence.
  for (const id of availableIds) {
    if (!sequence.includes(id)) sequence.push(id);
  }

  let candidate = sequence.find((id) => availableIds.includes(id)) ?? availableIds[0];

  // Override #1: defer the ordered pick if a still-bannable (not protected) map
  // is worse than it by at least the gap. Protected maps are off-limits here —
  // banning one is override #2's job (via the floor above).
  if (worstFirstEnabled) {
    const bannable = availableIds.filter(
      (id) => !lastSet.has(id) && typeof winValues[id] === "number",
    );
    if (bannable.length) {
      const worst = bannable.reduce((m, id) =>
        winValues[id] < winValues[m] ? id : m,
      );
      if (
        typeof winValues[candidate] === "number" &&
        winValues[candidate] - winValues[worst] >= worstFirstGap
      ) {
        candidate = worst;
      }
    }
  }

  return byId[candidate] ?? null;
}
