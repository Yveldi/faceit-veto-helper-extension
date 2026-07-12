// Main-world interceptor (declared with "world": "MAIN" in the manifest, run at
// document_start). It runs in the PAGE's JS context — not the extension's
// isolated content-script world — so it can wrap the page's own `fetch` /
// `XMLHttpRequest` and read the responses FACEIT itself fetches.
//
// We harvest two of FACEIT's own matchroom calls (we NEVER make either — the
// extension's hard rule is "no new network requests for loading the page"; we
// only read what the page already loads and relay it to the content script via
// window.postMessage):
//   1. `user-summary/v2/list` — per player: `country` (flag) + equipped
//      cosmetics (`active_cosmetic_items` -> avatar frame + profile-card bg).
//   2. `team-leagues/.../users:batchGetCurrent` — per player: current ESEA
//      league division + region (drives the ESEA-star hover popover).
//   3. `fpl/v1/users/details` — per player: FPL position + config (drives the
//      FPL badge that replaces the ESEA badge, and its hover popover).
//
// Plain, dependency-free JS: it lives in public/ and is copied verbatim to
// dist/ (it is never bundled, so it must not use imports or JSX).
(function () {
  "use strict";

  // Each target maps a URL substring to the postMessage channel the content
  // script listens on. Add a new pair here to piggyback another FACEIT call.
  const TARGETS = [
    { match: "/user-summary/v2/list", channel: "fvh-user-summary" },
    { match: "users:batchGetCurrent", channel: "fvh-team-leagues" },
    { match: "/fpl/v1/users/details", channel: "fvh-fpl" },
  ];

  function targetFor(url) {
    if (!url) return null;
    const u = String(url);
    for (const t of TARGETS) {
      if (u.indexOf(t.match) !== -1) return t;
    }
    return null;
  }

  // Relay a captured payload to the isolated content script. Same window, so a
  // postMessage crosses the MAIN <-> isolated world boundary. We forward the raw
  // JSON payload; the content side pulls out what it needs.
  function relay(channel, json) {
    try {
      if (!json) return;
      window.postMessage(
        { source: channel, payload: json.payload ?? json },
        window.location.origin,
      );
    } catch {
      // ignore — a bad/large payload must never break the page
    }
  }

  // --- fetch ---------------------------------------------------------------
  const origFetch = window.fetch;
  if (typeof origFetch === "function") {
    window.fetch = function (input, init) {
      const url = typeof input === "string" ? input : input && input.url;
      const promise = origFetch.apply(this, arguments);
      const target = targetFor(url);
      if (target) {
        promise
          .then((res) => {
            // Clone so we never consume the body the page is waiting on.
            res
              .clone()
              .json()
              .then((json) => relay(target.channel, json))
              .catch(() => {});
          })
          .catch(() => {});
      }
      return promise;
    };
  }

  // --- XMLHttpRequest ------------------------------------------------------
  const XHR = window.XMLHttpRequest;
  if (XHR && XHR.prototype) {
    const origOpen = XHR.prototype.open;
    const origSend = XHR.prototype.send;
    XHR.prototype.open = function (method, url) {
      this.__fvhUrl = url;
      return origOpen.apply(this, arguments);
    };
    XHR.prototype.send = function () {
      const target = targetFor(this.__fvhUrl);
      if (target) {
        this.addEventListener("load", function () {
          try {
            const text = this.responseText;
            if (text) relay(target.channel, JSON.parse(text));
          } catch {
            // ignore
          }
        });
      }
      return origSend.apply(this, arguments);
    };
  }
})();
