import { useEffect, useState } from "react";

const MATCH_TEXT = /match (ready|found)/i;

function isMatchDialog(el) {
  return (
    el instanceof HTMLElement &&
    el.getAttribute("role") === "dialog" &&
    el.getAttribute("data-dialog-type") === "MODAL" &&
    MATCH_TEXT.test(el.textContent)
  );
}

function findOpenMatchDialog(root) {
  if (!(root instanceof HTMLElement)) return null;
  const candidates = [];
  if (root.getAttribute("role") === "dialog") candidates.push(root);
  candidates.push(
    ...root.querySelectorAll('[role="dialog"][data-dialog-type="MODAL"]'),
  );
  for (const el of candidates) {
    if (isMatchDialog(el) && el.getAttribute("data-state") !== "closed") {
      return el;
    }
  }
  return null;
}

// Returns the "Match ready" dialog element while it is open, null otherwise.
export default function useMatchDetector() {
  const [dialog, setDialog] = useState(null);

  useEffect(() => {
    let current = null;
    const update = (el) => {
      current = el;
      setDialog(el);
    };

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "attributes") {
          const el = mutation.target;
          if (!isMatchDialog(el)) continue;
          if (el.getAttribute("data-state") === "open") {
            if (el !== current) update(el);
          } else if (el === current) {
            update(null);
          }
        } else {
          for (const node of mutation.addedNodes) {
            const found = findOpenMatchDialog(node);
            if (found && found !== current) update(found);
          }
          for (const node of mutation.removedNodes) {
            if (
              current &&
              (node === current ||
                (node instanceof HTMLElement && node.contains(current)))
            ) {
              update(null);
            }
          }
        }
      }
    });

    const initial = findOpenMatchDialog(document.body);
    if (initial) update(initial);

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state"],
    });

    return () => observer.disconnect();
  }, []);

  return dialog;
}
