// DOM glue for the Position Caller: everything that reads or writes FACEIT's own
// matchroom chat / veto panel. All learned from a real logged-in matchroom (see
// the faceit-match-state-machine memory):
//   - The right rail stacks TWO chat panels, each a `ChatSection__Container` with
//     a `ChatSection__Header` label ("Room chat" / "Team chat") and a controlled
//     `textarea[aria-label="Message input"]`. We only ever touch the Team-chat one.
//   - Sending = native value setter + `input` event (React onChange) + Enter
//     keydown (there is no send button; onKeyDown sends). Verified end-to-end.
//   - The live veto is a countdown panel with `[data-testid="matchroomActionMessage"]`
//     present while it runs; it clears when the veto concludes. For a non-captain
//     the ban rows never drop per-ban, so the action message is the clean signal.
//
// All selectors anchor on stable styled-component PREFIXES / aria labels / testids
// (the `-sc-<hash>` suffix churns on FACEIT rebuilds), matching how the rest of
// the extension reads the site. Header text is English, same language assumption
// as useVetoTurn / the roster status reads.

const CHAT_CONTAINER = '[class*="ChatSection__Container"]';
const MSG_INPUT = 'textarea[aria-label="Message input"]';

// The `ChatSection__Container` whose header reads exactly "Team chat" (vs the
// stacked "Room chat" panel). Null if the team chat isn't present (e.g. you're a
// spectator, or the room hasn't rendered it yet).
export function findTeamChatContainer() {
  for (const c of document.querySelectorAll(CHAT_CONTAINER)) {
    for (const el of c.querySelectorAll("div,span,h2,h3")) {
      const t = (el.textContent || "").trim();
      if (t === "Team chat" && el.querySelectorAll("*").length <= 1) return c;
    }
  }
  return null;
}

// The "Team chat" header label element itself — the anchor the cog button sits
// beside. Returns the element (a `ChatSection__HeaderContainer`) or null.
export function findTeamChatHeaderLabel() {
  for (const c of document.querySelectorAll(CHAT_CONTAINER)) {
    for (const el of c.querySelectorAll("div,span,h2,h3")) {
      const t = (el.textContent || "").trim();
      if (t === "Team chat" && el.querySelectorAll("*").length <= 1) return el;
    }
  }
  return null;
}

// Send a message to the Team chat, driving FACEIT's controlled textarea the way
// its React handlers expect. Returns true if the input was found and the send
// was dispatched. No-op (false) if the team chat isn't present.
export function sendTeamChat(text) {
  const container = findTeamChatContainer();
  const ta = container?.querySelector(MSG_INPUT);
  if (!ta) return false;
  ta.focus();
  // Raw `ta.value = …` won't register (controlled input). Use the native setter
  // + an `input` event so React's onChange records the text, then Enter to send.
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  setter ? setter.call(ta, text) : (ta.value = text);
  ta.dispatchEvent(new Event("input", { bubbles: true }));
  ta.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Enter",
      code: "Enter",
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true,
    }),
  );
  return true;
}

// Best-effort: has the logged-in user already posted anything in the Team chat
// this match? Used only to suppress the load-time ("Lobby loads") call — if the
// user beat us to it (or a prior tab already sent), we stand down. FACEIT groups
// a message run under one author-name label; we match an element whose own text
// is exactly the self nickname inside the team-chat panel. Imperfect (a nickname
// echoed in a message body could match), but the only cost of a false positive
// is skipping one redundant auto-call, which the per-match flag would skip anyway.
export function selfHasMessagedTeamChat(selfNickname) {
  if (!selfNickname) return false;
  const container = findTeamChatContainer();
  if (!container) return false;
  const target = selfNickname.trim().toLowerCase();
  for (const el of container.querySelectorAll("span,div,a,p")) {
    if (el.querySelectorAll("*").length > 0) continue; // leaf nodes only
    if ((el.textContent || "").trim().toLowerCase() === target) return true;
  }
  return false;
}

// Is the live veto currently running? True while FACEIT shows the veto action
// message (`[data-testid="matchroomActionMessage"]` present + non-empty). This is
// the clean, language-independent, captain-independent "veto in progress" signal
// (the ban rows themselves don't change for a non-captain).
export function isVetoActive() {
  const el = document.querySelector('[data-testid="matchroomActionMessage"]');
  return !!el && (el.textContent || "").trim().length > 0;
}

// Watch for the live veto CONCLUDING and call `onEnd` once. We only arm after
// having actually witnessed the veto active (so a room opened post-veto never
// fires), then fire when the action message clears for good. A short debounce
// avoids a transient blip between ban turns being read as the end. Returns a
// disconnect function.
export function observeVetoEnd(onEnd) {
  let sawActive = false;
  let fired = false;
  let debounce = null;

  const check = () => {
    if (fired) return;
    if (isVetoActive()) {
      sawActive = true;
      clearTimeout(debounce);
      debounce = null;
      return;
    }
    // Not active. Only meaningful once we've seen it active. Require it to stay
    // gone across a short debounce so a between-turns blip doesn't trip us.
    if (!sawActive || debounce) return;
    debounce = setTimeout(() => {
      if (!fired && sawActive && !isVetoActive()) {
        fired = true;
        onEnd();
      }
    }, 400);
  };

  const isOurs = (node) => {
    const el = node?.nodeType === 1 ? node : node?.parentElement;
    return !!el?.closest(".fvh-root, #faceit-veto-helper-root");
  };
  const observer = new MutationObserver((mutations) => {
    if (mutations.every((m) => isOurs(m.target))) return;
    check();
  });
  check();
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  return () => {
    clearTimeout(debounce);
    observer.disconnect();
  };
}
