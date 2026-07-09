// Main-world interceptor (declared with "world": "MAIN" in the manifest, run at
// document_start). It runs in the PAGE's JS context — not the extension's
// isolated content-script world — so it can wrap the page's own `fetch` /
// `XMLHttpRequest` and read the responses FACEIT itself fetches.
//
// The only thing we harvest is FACEIT's `user-summary/v2/list` call, which the
// matchroom fires on load. It carries, per player: `country` (flag), and the
// equipped cosmetics (`active_cosmetic_items` -> avatar frame + profile-card
// background). We do NOT make this request ourselves (the extension's hard rule
// is "no new network requests for loading the page"); we only read what the
// page already loads and relay it to the content script via window.postMessage.
//
// Plain, dependency-free JS: it lives in public/ and is copied verbatim to
// dist/ (it is never bundled, so it must not use imports or JSX).
(function () {
  "use strict";

  const TARGET = "/user-summary/v2/list";
  const CHANNEL = "fvh-user-summary";

  // Relay a captured payload to the isolated content script. Same window, so a
  // postMessage crosses the MAIN <-> isolated world boundary. We forward the raw
  // JSON; the content side pulls out country/cosmetics per guid.
  function relay(json) {
    try {
      if (!json) return;
      window.postMessage({ source: CHANNEL, payload: json.payload ?? json }, window.location.origin);
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
      if (url && url.indexOf(TARGET) !== -1) {
        promise
          .then((res) => {
            // Clone so we never consume the body the page is waiting on.
            res
              .clone()
              .json()
              .then(relay)
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
      if (this.__fvhUrl && String(this.__fvhUrl).indexOf(TARGET) !== -1) {
        this.addEventListener("load", function () {
          try {
            const text = this.responseText;
            if (text) relay(JSON.parse(text));
          } catch {
            // ignore
          }
        });
      }
      return origSend.apply(this, arguments);
    };
  }
})();
