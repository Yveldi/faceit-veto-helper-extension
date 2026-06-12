import { faceitAPI, fetchWithRetry } from "./utils";

function decodeJwtPayload(token) {
  const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(atob(base64));
}

// Scan localStorage for a FACEIT JWT and read the user guid out of it.
// Synchronous and instant — no network — so this is the fast path.
function userIdFromLocalJwt() {
  for (let i = 0; i < localStorage.length; i++) {
    const raw = localStorage.getItem(localStorage.key(i));
    if (!raw) continue;
    const match = raw.match(
      /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/,
    );
    if (!match) continue;
    try {
      const payload = decodeJwtPayload(match[0]);
      const id = payload.guid ?? payload.sub ?? payload.userId;
      if (id) return id;
    } catch {
      // not a JWT we can read; keep scanning
    }
  }
  return null;
}

let cachedUserId = null;

// ID of the logged-in user. Resolved from the local JWT first (instant),
// then memoized; sessions/me is only a fallback if no token is found.
export async function getSelfUserId() {
  if (cachedUserId) return cachedUserId;

  const localId = userIdFromLocalJwt();
  if (localId) {
    console.log("FVH: userId from local JWT");
    return (cachedUserId = localId);
  }

  try {
    const res = await fetchWithRetry(`${faceitAPI}/users/v1/sessions/me`);
    if (res.ok) {
      const data = await res.json();
      // sessions/me returns the profile at the top level (no `payload` wrapper),
      // but tolerate a wrapped shape too, just in case.
      const profile = data.payload ?? data;
      const id = profile?.id ?? profile?.guid ?? profile?.userId;
      if (id) return (cachedUserId = id);
    }
  } catch (error) {
    console.log("FVH: sessions/me fallback failed", error);
  }
  return null;
}

// The ID of the user's active matchmaking match (the kind that pops the
// "Match ready" dialog with a votable map pool), or null. Scheduled league /
// championship / hub matches are ignored — they live in groupByState too but
// carry no matchmaking map pool.
export async function getCurrentMatchId(userId) {
  const res = await fetchWithRetry(
    `${faceitAPI}/match/v1/matches/groupByState?${new URLSearchParams({ userId })}`,
  );
  const payload = (await res.json()).payload ?? {};
  const matches = Object.values(payload)
    .flat()
    .filter((m) => m?.id);

  console.log(
    "FVH: groupByState matches =",
    matches.map((m) => ({
      id: m.id,
      state: m.state,
      status: m.status,
      playing: m.playing,
      entityType: m.entity?.type,
    })),
  );

  const queueMatches = matches.filter((m) => m.entity?.type === "matchmaking");
  // If several exist, prefer a live one over anything scheduled.
  const best =
    queueMatches.find((m) => m.playing || m.status === "LIVE") ??
    queueMatches[0];
  return best?.id ?? null;
}

// All maps available in a match's pool, or null if they can't be determined.
export async function getMatchMaps(matchId) {
  const res = await fetchWithRetry(`${faceitAPI}/match/v2/match/${matchId}`);
  const payload = (await res.json()).payload;
  if (!payload) return null;

  // Voting stage and later: votable maps are listed directly
  const votables = payload.maps?.map;
  if (votables) {
    const maps = Object.values(votables)
      .map((m) => m?.class_name)
      .filter(Boolean);
    if (maps.length) return maps;
  }

  // Check-in stage: the pool lives in the tags. It can be a single
  // comma-joined tag ("de_nuke,de_dust2,..."), several separate map tags,
  // or just one ("de_dust2"). Pull out every entry that looks like a map
  // while ignoring metadata tags such as "match_0" or "nonfullstack".
  const mapPrefix = /^(de|cs|ar|dz|gd|coop|dm)_/;
  const tagMaps = [
    ...new Set(
      (payload.tags ?? [])
        .flatMap((tag) => tag.split(","))
        .map((entry) => entry.trim())
        .filter((entry) => mapPrefix.test(entry)),
    ),
  ];
  if (tagMaps.length) return tagMaps;

  // Maps not assigned yet — log the shape so we can see when they appear
  console.log("FVH: maps not ready", {
    state: payload.state,
    tags: payload.tags,
  });
  return null;
}
