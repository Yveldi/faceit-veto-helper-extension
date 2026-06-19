import { useEffect, useState } from "react";

// Detects the FACEIT veto panel state via a MutationObserver. Returns:
//   { phase: "server"|"map"|null, isOurTurn, options: [{ name, button }] }
// where `options` are the rows we can ban right now (enabled Ban button). It is
// our turn only when the action message reads "Your turn to ban a server/map";
// any other text (captain voting, opponent banning) means no-op. Detection is
// language-independent for the rows: each option has exactly one <button> (the
// Ban button; already-banned rows have an info icon, no button) and the name
// lives in the row's `.middleSlot`.
const TURN_RE = /your turn to ban a (server|map)/i;

const IDLE = { phase: null, isOurTurn: false, options: [] };

function readVeto() {
  const msgEl = document.querySelector('[data-testid="matchroomActionMessage"]');
  const match = msgEl && msgEl.textContent.trim().match(TURN_RE);
  if (!match) return IDLE;

  const phase = match[1].toLowerCase();
  const options = [];
  for (const row of document.querySelectorAll('[data-testid="matchPreference"]')) {
    const button = row.querySelector("button");
    if (!button || button.disabled) continue;
    const mid = row.querySelector(".middleSlot");
    const name = mid ? mid.textContent.trim() : "";
    if (name) options.push({ name, button });
  }
  return { phase, isOurTurn: true, options };
}

// Mutations inside our own overlays must not retrigger a scan (the countdown bar
// re-renders every tick), or we'd loop.
function isOurs(node) {
  const el = node?.nodeType === 1 ? node : node?.parentElement;
  return !!el?.closest(".fvh-autoveto, #faceit-veto-helper-root, .fvh-root");
}

export default function useVetoTurn() {
  const [state, setState] = useState(IDLE);

  useEffect(() => {
    let timer;
    const update = () => setState(readVeto());
    const observer = new MutationObserver((mutations) => {
      if (mutations.every((m) => isOurs(m.target))) return;
      clearTimeout(timer);
      timer = setTimeout(update, 120);
    });

    update();
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
    });

    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, []);

  return state;
}
