// Control panel logic. Plain JS (MV3 blocks inline scripts) shared by Chrome
// and Firefox via the `chrome` namespace. Keep the defaults in sync with
// src/settings.js SETTINGS_DEFAULTS.
const api = globalThis.chrome ?? globalThis.browser;
const DEFAULTS = {
  autoAcceptEnabled: true,
  autoAcceptDelay: 10,
  vetoHelperEnabled: true,
  vetoHelperLocked: false,
  regretHelperEnabled: false,
  regretHelperAlways: false,
  autoVetoEnabled: false,
  autoVetoDelay: 5,
  autoVetoServers: false,
  autoVetoWorstFirstEnabled: false,
  autoVetoWorstFirstGap: 10,
  autoVetoProtectFloorEnabled: false,
  autoVetoProtectFloor: 10, // now a points gap, not an absolute floor
  autoVetoMapFirst: [],
  autoVetoMapDynamic: [],
  autoVetoMapLast: [],
  autoVetoServerOrder: [],
};

const els = {
  autoAcceptEnabled: document.getElementById("autoAcceptEnabled"),
  autoAcceptDelay: document.getElementById("autoAcceptDelay"),
  delayValue: document.getElementById("delayValue"),
  delayRow: document.getElementById("delayRow"),
  vetoHelperEnabled: document.getElementById("vetoHelperEnabled"),
  vetoHelperLocked: document.getElementById("vetoHelperLocked"),
  vetoLockReveal: document.getElementById("vetoLockReveal"),
  regretHelperEnabled: document.getElementById("regretHelperEnabled"),
  regretHelperAlways: document.getElementById("regretHelperAlways"),
  regretAlwaysReveal: document.getElementById("regretAlwaysReveal"),
  autoVetoEnabled: document.getElementById("autoVetoEnabled"),
  autoVetoGroup: document.getElementById("autoVetoGroup"),
  autoVetoDelay: document.getElementById("autoVetoDelay"),
  autoVetoDelayValue: document.getElementById("autoVetoDelayValue"),
  autoVetoServers: document.getElementById("autoVetoServers"),
  overridesHeader: document.getElementById("overridesHeader"),
  autoVetoWorstFirstEnabled: document.getElementById(
    "autoVetoWorstFirstEnabled",
  ),
  worstFirstFeature: document.getElementById("worstFirstFeature"),
  autoVetoWorstFirstReveal: document.getElementById("autoVetoWorstFirstReveal"),
  autoVetoWorstFirstGap: document.getElementById("autoVetoWorstFirstGap"),
  autoVetoWorstFirstGapValue: document.getElementById(
    "autoVetoWorstFirstGapValue",
  ),
  worstFirstExample: document.getElementById("worstFirstExample"),
  autoVetoProtectFloorEnabled: document.getElementById(
    "autoVetoProtectFloorEnabled",
  ),
  protectFloorFeature: document.getElementById("protectFloorFeature"),
  autoVetoProtectFloorReveal: document.getElementById(
    "autoVetoProtectFloorReveal",
  ),
  autoVetoProtectFloor: document.getElementById("autoVetoProtectFloor"),
  autoVetoProtectFloorValue: document.getElementById(
    "autoVetoProtectFloorValue",
  ),
  protectFloorExample: document.getElementById("protectFloorExample"),
  prefToggle: document.getElementById("prefToggle"),
  prefEditor: document.getElementById("prefEditor"),
  serverReveal: document.getElementById("serverReveal"),
  zoneFirst: document.getElementById("zoneFirst"),
  zoneDynamic: document.getElementById("zoneDynamic"),
  zoneLast: document.getElementById("zoneLast"),
  zoneServer: document.getElementById("zoneServer"),
};

function save(partial) {
  api.storage.local.set(partial);
}

// Force the auto-sizing popup window to re-measure to the exact document height.
// Setting an explicit html height (then clearing it next frame) hits the instant
// resize path that always lands correctly, so the window can't stay stuck at a
// size it reached while chasing the animation (e.g. after a fast double-click).
function snapPanel() {
  const html = document.documentElement;
  html.style.height = `${document.body.scrollHeight}px`;
  void html.offsetHeight; // commit
  requestAnimationFrame(() => {
    html.style.height = "";
  });
}

// Open/close a reveal with a smooth height animation (real measured max-height,
// so siblings glide down). The popup window lags while chasing that height, so
// once the animation settles we lock the element to a clean resting height and
// snapPanel() the window to the exact size. The settle timer is reset on every
// toggle, so only the final state triggers the snap.
const REVEAL_MS = 240; // keep in sync with the .reveal transition
function setReveal(reveal, open) {
  clearTimeout(reveal._fvhTimer);
  reveal.classList.toggle("open", open); // drives the opacity/slide
  document.documentElement.style.height = ""; // clear any prior snap pin

  // Initial population: jump straight to the resting state, no animation.
  if (document.body.classList.contains("no-anim")) {
    reveal.style.maxHeight = open ? "none" : "0px";
    return;
  }

  if (open) {
    // animate from the current height up to the measured content height
    reveal.style.maxHeight = `${reveal.scrollHeight}px`;
  } else {
    // pin the current rendered height, then collapse to 0 so it animates down
    reveal.style.maxHeight = `${reveal.offsetHeight}px`;
    void reveal.offsetHeight; // reflow so the next change transitions
    reveal.style.maxHeight = "0px";
  }

  // After the animation, settle to a clean resting height and snap the window so
  // it can never be left at an interrupted (wrong) size.
  reveal._fvhTimer = setTimeout(() => {
    reveal.style.maxHeight = reveal.classList.contains("open") ? "none" : "0px";
    snapPanel();
  }, REVEAL_MS + 40);
}

// --- worked examples for the two map overrides ------------------------------
// id->name (set in initEditor) and the example map pair per feature. The second
// map is re-rolled when the popup opens or the map lists change, so it's never
// stale; the slider only re-renders the numbers.
let mapNameById = {};
const exampleMaps = { worstFirst: null, protect: null };

function reflectDelayEnabled() {
  const on = els.autoAcceptEnabled.checked;
  els.delayRow.classList.toggle("disabled", !on);
  els.autoAcceptDelay.disabled = !on;
}

// "Always show full pool" is a sub-option of the Regret Helper: it's only shown
// (and only meaningful) while the Regret Helper is on. Toggling `.open` plays
// the reveal animation (suppressed on first load by body.no-anim).
function reflectRegretLink() {
  setReveal(els.regretAlwaysReveal, els.regretHelperEnabled.checked);
}

// "Lock the veto helper" only matters while the Veto helper is on.
function reflectVetoLock() {
  setReveal(els.vetoLockReveal, els.vetoHelperEnabled.checked);
}

function applyBasicSettings(s) {
  els.autoAcceptEnabled.checked = s.autoAcceptEnabled;
  els.autoAcceptDelay.value = s.autoAcceptDelay;
  els.delayValue.textContent = s.autoAcceptDelay;
  els.vetoHelperEnabled.checked = s.vetoHelperEnabled;
  els.vetoHelperLocked.checked = s.vetoHelperLocked;
  els.regretHelperEnabled.checked = s.regretHelperEnabled;
  // Invariant: "always" only applies when the Regret Helper is on. Normalise
  // any stale state and persist the fix.
  const always = s.regretHelperAlways && s.regretHelperEnabled;
  els.regretHelperAlways.checked = always;
  if (always !== s.regretHelperAlways) save({ regretHelperAlways: always });
  reflectDelayEnabled();
  reflectRegretLink();
  reflectVetoLock();
}

els.autoAcceptEnabled.addEventListener("change", () => {
  save({ autoAcceptEnabled: els.autoAcceptEnabled.checked });
  reflectDelayEnabled();
});

els.autoAcceptDelay.addEventListener("input", () => {
  els.delayValue.textContent = els.autoAcceptDelay.value;
});

els.autoAcceptDelay.addEventListener("change", () => {
  save({ autoAcceptDelay: Number(els.autoAcceptDelay.value) });
});

els.vetoHelperEnabled.addEventListener("change", () => {
  const on = els.vetoHelperEnabled.checked;
  const update = { vetoHelperEnabled: on };
  // Turning the Veto helper off resets the window: clear the lock and the saved
  // position, so a lost or locked-off-screen window is recoverable by toggling
  // it off and on (it comes back unlocked at the default spot).
  if (!on) {
    update.vetoHelperLocked = false;
    update.vetoHelperPosition = null;
    els.vetoHelperLocked.checked = false;
  }
  save(update);
  reflectVetoLock();
});

els.vetoHelperLocked.addEventListener("change", () => {
  save({ vetoHelperLocked: els.vetoHelperLocked.checked });
});

els.regretHelperEnabled.addEventListener("change", () => {
  const on = els.regretHelperEnabled.checked;
  const update = { regretHelperEnabled: on };
  // Turning the Regret Helper off also turns "always" off.
  if (!on && els.regretHelperAlways.checked) {
    els.regretHelperAlways.checked = false;
    update.regretHelperAlways = false;
  }
  save(update);
  reflectRegretLink();
});

els.regretHelperAlways.addEventListener("change", () => {
  const on = els.regretHelperAlways.checked;
  const update = { regretHelperAlways: on };
  // Turning "always" on turns the Regret Helper on.
  if (on && !els.regretHelperEnabled.checked) {
    els.regretHelperEnabled.checked = true;
    update.regretHelperEnabled = true;
    reflectRegretLink();
  }
  save(update);
});

// --- Auto veto --------------------------------------------------------------

function reflectAutoVetoEnabled() {
  els.autoVetoGroup.classList.toggle("disabled", !els.autoVetoEnabled.checked);
}

// Each map override's threshold slider is only shown while its toggle is on, and
// the server list only while server banning is on. All use the reveal animation.
function reflectWorstFirst() {
  setReveal(
    els.autoVetoWorstFirstReveal,
    els.autoVetoWorstFirstEnabled.checked,
  );
}
function reflectProtectFloor() {
  setReveal(
    els.autoVetoProtectFloorReveal,
    els.autoVetoProtectFloorEnabled.checked,
  );
}
function reflectServerList() {
  setReveal(els.serverReveal, els.autoVetoServers.checked);
}

els.autoVetoEnabled.addEventListener("change", () => {
  save({ autoVetoEnabled: els.autoVetoEnabled.checked });
  reflectAutoVetoEnabled();
});

els.autoVetoDelay.addEventListener("input", () => {
  els.autoVetoDelayValue.textContent = els.autoVetoDelay.value;
});
els.autoVetoDelay.addEventListener("change", () => {
  save({ autoVetoDelay: Number(els.autoVetoDelay.value) });
});

els.autoVetoServers.addEventListener("change", () => {
  save({ autoVetoServers: els.autoVetoServers.checked });
  reflectServerList();
});

els.autoVetoWorstFirstEnabled.addEventListener("change", () => {
  save({ autoVetoWorstFirstEnabled: els.autoVetoWorstFirstEnabled.checked });
  reflectWorstFirst();
});
els.autoVetoWorstFirstGap.addEventListener("input", () => {
  els.autoVetoWorstFirstGapValue.textContent = els.autoVetoWorstFirstGap.value;
  renderExamples();
});
els.autoVetoWorstFirstGap.addEventListener("change", () => {
  save({ autoVetoWorstFirstGap: Number(els.autoVetoWorstFirstGap.value) });
});

els.autoVetoProtectFloorEnabled.addEventListener("change", () => {
  save({ autoVetoProtectFloorEnabled: els.autoVetoProtectFloorEnabled.checked });
  reflectProtectFloor();
});
els.autoVetoProtectFloor.addEventListener("input", () => {
  els.autoVetoProtectFloorValue.textContent = els.autoVetoProtectFloor.value;
  renderExamples();
});
els.autoVetoProtectFloor.addEventListener("change", () => {
  save({ autoVetoProtectFloor: Number(els.autoVetoProtectFloor.value) });
});

let prefOpen = false;
els.prefToggle.addEventListener("click", () => {
  prefOpen = !prefOpen;
  setReveal(els.prefEditor, prefOpen); // animate the panel open/closed + snap
  els.prefToggle.textContent = prefOpen
    ? "Hide veto preferences ▴"
    : "Edit veto preferences ▾";
});

// --- preference drag-and-drop editor ----------------------------------------

// The maps and servers are loaded from the same JSON the content script uses
// (copied into dist/ by Vite), so the pool stays in one place.
function loadPools() {
  return Promise.all([
    fetch(api.runtime.getURL("mapPool.json")).then((r) => r.json()),
    fetch(api.runtime.getURL("serverPool.json")).then((r) => r.json()),
  ]).then(([maps, servers]) => ({ maps, servers }));
}

// Drop the saved ids that are no longer in the pool, and add any new pool maps
// to the dynamic group (so new maps default to win-odds banning).
function buildMapPrefs(stored, maps) {
  const ids = maps.map((m) => m.id);
  const has = (id) => ids.includes(id);
  const first = (stored.autoVetoMapFirst || []).filter(has);
  const last = (stored.autoVetoMapLast || []).filter(has);
  let dynamic = (stored.autoVetoMapDynamic || []).filter(has);
  const placed = new Set([...first, ...last, ...dynamic]);
  dynamic = [...dynamic, ...ids.filter((id) => !placed.has(id))];
  return { first, dynamic, last };
}

function buildServerPrefs(stored, serverNames) {
  const order = (stored.autoVetoServerOrder || []).filter((n) =>
    serverNames.includes(n),
  );
  return [...order, ...serverNames.filter((n) => !order.includes(n))];
}

// An item is { id, label, group, img } where `img` is an optional icon (a map
// thumbnail or a country flag) shown before the label. Icons are sized in CSS so
// the row height stays constant.
function makeItem({ id, label, group, img, imgClass }) {
  const el = document.createElement("div");
  el.className = "dd-item";
  el.draggable = true;
  el.dataset.id = id;
  el.dataset.group = group;
  if (img) {
    const icon = document.createElement("img");
    icon.className = imgClass;
    icon.src = img;
    icon.alt = "";
    icon.draggable = false; // drag the row, not the image
    el.appendChild(icon);
  }
  const text = document.createElement("span");
  text.textContent = label;
  el.appendChild(text);
  el.addEventListener("dragstart", () => {
    // Defer so the drag image is captured before the item is dimmed.
    setTimeout(() => el.classList.add("dragging"), 0);
  });
  el.addEventListener("dragend", () => {
    el.classList.remove("dragging");
    el.dispatchEvent(new CustomEvent("dd-change", { bubbles: true }));
  });
  return el;
}

function fillZone(zone, ids, itemFor) {
  zone.replaceChildren(...ids.map((id) => makeItem(itemFor(id))));
}

function readZone(zone) {
  return [...zone.querySelectorAll(".dd-item")].map((el) => el.dataset.id);
}

// The item to insert before, given the cursor Y within a zone (or null = end).
function getAfterElement(zone, y) {
  const items = [...zone.querySelectorAll(".dd-item:not(.dragging)")];
  let closest = null;
  let closestOffset = -Infinity;
  for (const item of items) {
    const box = item.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closestOffset) {
      closestOffset = offset;
      closest = item;
    }
  }
  return closest;
}

// Live-reordering sortable across one group of zones; items can be dragged
// within and between them, but not into another group (maps vs servers). Calls
// onChange after every drop (via the dd-change event the items dispatch).
function initSortable(zones, group, onChange) {
  for (const zone of zones) {
    zone.addEventListener("dragover", (e) => {
      const dragging = document.querySelector(".dd-item.dragging");
      if (!dragging || dragging.dataset.group !== group) return;
      e.preventDefault();
      const after = getAfterElement(zone, e.clientY);
      if (after === null) zone.appendChild(dragging);
      else zone.insertBefore(dragging, after);
    });
    zone.addEventListener("dd-change", onChange);
  }
}

function initEditor(stored, pools) {
  const mapById = Object.fromEntries(pools.maps.map((m) => [m.id, m]));
  mapNameById = Object.fromEntries(pools.maps.map((m) => [m.id, m.name]));
  const flagByServer = Object.fromEntries(
    pools.servers.map((s) => [s.name, `flags/${s.code}.svg`]),
  );
  const serverNames = pools.servers.map((s) => s.name);

  const { first, dynamic, last } = buildMapPrefs(stored, pools.maps);
  const servers = buildServerPrefs(stored, serverNames);

  const mapItem = (id) => ({
    id,
    label: mapById[id] ? mapById[id].name : id,
    group: "map",
    img: mapById[id] ? mapById[id].thumbnail : undefined,
    imgClass: "dd-thumb",
  });
  const serverItem = (name) => ({
    id: name,
    label: name,
    group: "server",
    img: flagByServer[name],
    imgClass: "dd-flag",
  });

  fillZone(els.zoneFirst, first, mapItem);
  fillZone(els.zoneDynamic, dynamic, mapItem);
  fillZone(els.zoneLast, last, mapItem);
  fillZone(els.zoneServer, servers, serverItem);

  const saveMaps = () =>
    save({
      autoVetoMapFirst: readZone(els.zoneFirst),
      autoVetoMapDynamic: readZone(els.zoneDynamic),
      autoVetoMapLast: readZone(els.zoneLast),
    });
  const saveServers = () =>
    save({ autoVetoServerOrder: readZone(els.zoneServer) });

  // After any map move, persist AND refresh the override visibility/examples.
  const onMaps = () => {
    saveMaps();
    refreshFeatureUI();
  };
  initSortable([els.zoneFirst, els.zoneDynamic, els.zoneLast], "map", onMaps);
  initSortable([els.zoneServer], "server", saveServers);

  // Persist the reconciled lists (first run, or pool changes) so the content
  // script always sees complete preferences.
  saveMaps();
  saveServers();
}

// The second example map: a random one from the "by win odds" list, else the
// least-extreme map of the opposite list (head = top, tail = bottom), else none.
function exampleSecondId(dynamic, otherList, otherEnd) {
  if (dynamic.length) {
    return dynamic[Math.floor(Math.random() * dynamic.length)];
  }
  if (otherList.length) {
    return otherEnd === "head" ? otherList[0] : otherList[otherList.length - 1];
  }
  return null;
}

// Re-pick the example map pair for each feature from the current lists. The
// first map is the player's most extreme choice: top of ban-first ("most hated")
// for worst-first, bottom of ban-last ("most protected") for protect.
function pickExampleMaps() {
  const first = readZone(els.zoneFirst);
  const dynamic = readZone(els.zoneDynamic);
  const last = readZone(els.zoneLast);
  exampleMaps.worstFirst = first.length
    ? { firstId: first[0], secondId: exampleSecondId(dynamic, last, "head") }
    : null;
  exampleMaps.protect = last.length
    ? {
        firstId: last[last.length - 1],
        secondId: exampleSecondId(dynamic, first, "tail"),
      }
    : null;
}

// Build one worked example using the gap as the (boundary) difference. For
// worst-first the player's pick is the better map and the worse one is banned
// first; for protect the protected map is the worse one and gets banned.
function renderExample(container, pair, gap, mode) {
  container.replaceChildren();
  if (!pair || !pair.firstId || !pair.secondId) return;
  const firstName = mapNameById[pair.firstId] || pair.firstId;
  const secondName = mapNameById[pair.secondId] || pair.secondId;
  const base = 40;
  const high = Math.min(base + gap, 99);
  const firstOdds = mode === "worstFirst" ? high : base;
  const secondOdds = mode === "worstFirst" ? base : high;
  const banned = mode === "worstFirst" ? secondName : firstName;
  const suffix = mode === "worstFirst" ? " first" : "";

  const span = (cls, text) => {
    const s = document.createElement("span");
    if (cls) s.className = cls;
    s.textContent = text;
    return s;
  };
  const oddsCls = (a, b) => (a < b ? "ex-lo" : "ex-hi");

  container.append(
    "e.g. ",
    span("ex-map", firstName),
    " ",
    span(oddsCls(firstOdds, secondOdds), `${firstOdds}%`),
    " vs ",
    span("ex-map", secondName),
    " ",
    span(oddsCls(secondOdds, firstOdds), `${secondOdds}%`),
    " → ban ",
    span("ex-ban", banned + suffix),
  );
}

function renderExamples() {
  renderExample(
    els.worstFirstExample,
    exampleMaps.worstFirst,
    Number(els.autoVetoWorstFirstGap.value),
    "worstFirst",
  );
  renderExample(
    els.protectFloorExample,
    exampleMaps.protect,
    Number(els.autoVetoProtectFloor.value),
    "protect",
  );
}

// Each override only does anything when the list it acts on (ban-first for
// worst-first, ban-last for protect) has maps, so show it only then. Also
// refresh the examples (re-rolling the random second map). Animated via setReveal.
function refreshFeatureUI() {
  pickExampleMaps();
  renderExamples();
  const hasFirst = readZone(els.zoneFirst).length > 0;
  const hasLast = readZone(els.zoneLast).length > 0;
  // The shared header shows whenever either override is shown.
  setReveal(els.overridesHeader, hasFirst || hasLast);
  setReveal(els.worstFirstFeature, hasFirst);
  setReveal(els.protectFloorFeature, hasLast);
}

function getSettings() {
  return new Promise((resolve) => api.storage.local.get(DEFAULTS, resolve));
}

// One combined init pass: set every control (and every reveal) to its stored
// state, THEN drop body.no-anim so the initial population never animates while
// later user toggles do. The double rAF guarantees the no-anim state has been
// painted before transitions are re-enabled.
Promise.all([loadPools(), getSettings()]).then(([pools, s]) => {
  applyBasicSettings(s);
  els.autoVetoEnabled.checked = s.autoVetoEnabled;
  els.autoVetoDelay.value = s.autoVetoDelay;
  els.autoVetoDelayValue.textContent = s.autoVetoDelay;
  els.autoVetoServers.checked = s.autoVetoServers;
  els.autoVetoWorstFirstEnabled.checked = s.autoVetoWorstFirstEnabled;
  els.autoVetoWorstFirstGap.value = s.autoVetoWorstFirstGap;
  els.autoVetoWorstFirstGapValue.textContent = s.autoVetoWorstFirstGap;
  els.autoVetoProtectFloorEnabled.checked = s.autoVetoProtectFloorEnabled;
  els.autoVetoProtectFloor.value = s.autoVetoProtectFloor;
  els.autoVetoProtectFloorValue.textContent = s.autoVetoProtectFloor;
  reflectAutoVetoEnabled();
  reflectWorstFirst();
  reflectProtectFloor();
  reflectServerList();
  initEditor(s, pools);
  refreshFeatureUI(); // override visibility + worked examples (instant on load)
  setReveal(els.prefEditor, false); // editor starts collapsed (no animation)
  requestAnimationFrame(() =>
    requestAnimationFrame(() => document.body.classList.remove("no-anim")),
  );
});
