import { faceitAPI, fetchWithRetry } from "./utils";

function decodeJwtPayload(token) {
  const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(atob(base64));
}

// Scan localStorage for a FACEIT JWT and read the user guid out of it.
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
      // not a JWT we can read. keep scanning
    }
  }
  return null;
}

let cachedUserId = null;

// ID of the logged-in user. Resolved from the local JWT first (instant),
// then memorised; sessions/me is only a fallback if no token is found.
export async function getSelfUserId() {
  if (cachedUserId) return cachedUserId;

  const localId = userIdFromLocalJwt();
  if (localId) return (cachedUserId = localId);

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
  } catch {
    // sessions/me is only a fallback; if it fails we just report no user.
  }
  return null;
}
