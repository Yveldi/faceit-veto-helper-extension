import { useEffect, useState } from "react";
import { matchID } from "../utils";

// FACEIT is a client-side-routed SPA, so the content script isn't reloaded
// between rooms. Returns the current room's match ID, or null when not on a
// matchroom. We detect navigation three ways:
//   - patched history.pushState / replaceState (instant, the common case),
//   - popstate (back/forward),
//   - a 1s URL-string poll as a safety net (no network) in case the SPA router
//     captured the original pushState reference before our patch installed.
export default function useMatchIdFromUrl() {
  const [id, setId] = useState(() => matchID(location.pathname));

  useEffect(() => {
    let current = id;
    const update = () => {
      const next = matchID(location.pathname);
      if (next !== current) {
        current = next;
        setId(next);
      }
    };

    const wrap = (method) => {
      const original = history[method];
      return function patched(...args) {
        const result = original.apply(this, args);
        update();
        return result;
      };
    };
    history.pushState = wrap("pushState");
    history.replaceState = wrap("replaceState");
    window.addEventListener("popstate", update);
    const poll = setInterval(update, 1000);

    return () => {
      window.removeEventListener("popstate", update);
      clearInterval(poll);
    };
  }, []);

  return id;
}
