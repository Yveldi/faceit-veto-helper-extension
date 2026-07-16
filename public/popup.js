// Control panel logic — the "Aurora Glass" categorised redesign. Plain JS (MV3
// blocks inline scripts), shared by Chrome and Firefox via the `chrome`
// namespace. Keep DEFAULTS in sync with src/settings.js SETTINGS_DEFAULTS.
const api = globalThis.chrome ?? globalThis.browser;

const DEFAULTS = {
  globalEnabled: true,
  autoAcceptEnabled: true,
  oneTimeAcceptEnabled: false,
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
  replacePlayerCards: true,
  showPlayerCardStats: true,
  playerTrackingEnabled: false,
  spotEnabled: false,
  spotDuo: false,
};

// The four navigable categories on the left icon rail (design order; rail opens
// on Veto Helper). Icons are the design's inline stroke SVGs.
const ICON = {
  accept:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  vhelper:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/></svg>',
  autoveto:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6 18.4 18.4"/></svg>',
  social:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.3"/><path d="M2.8 20a6.2 6.2 0 0 1 12.4 0"/><path d="M16.5 5.3a3.2 3.2 0 0 1 0 5.9"/><path d="M18 20a6 6 0 0 0-3-5.1"/></svg>',
};
const CATS = [
  { key: "accept", name: "Auto Accept", icon: ICON.accept },
  { key: "vhelper", name: "Veto Helper", icon: ICON.vhelper },
  { key: "autoveto", name: "Auto Veto", icon: ICON.autoveto },
  { key: "social", name: "Social", icon: ICON.social },
];
const DEFAULT_NAV = "vhelper";

const $ = (id) => document.getElementById(id);
const els = {
  // shell / nav
  globalEnabled: $("globalEnabled"),
  masterLabel: $("masterLabel"),
  cpBody: $("cpBody"),
  cpRail: $("cpRail"),
  cpEyebrow: $("cpEyebrow"),
  // auto accept
  autoAcceptEnabled: $("autoAcceptEnabled"),
  oneTimeCard: $("oneTimeCard"),
  oneTimeAcceptEnabled: $("oneTimeAcceptEnabled"),
  oneTimeNote: $("oneTimeNote"),
  autoAcceptDelay: $("autoAcceptDelay"),
  delayValue: $("delayValue"),
  // veto helper
  vetoHelperEnabled: $("vetoHelperEnabled"),
  vetoHelperLocked: $("vetoHelperLocked"),
  vetoLockReveal: $("vetoLockReveal"),
  regretHelperEnabled: $("regretHelperEnabled"),
  regretHelperAlways: $("regretHelperAlways"),
  regretAlwaysReveal: $("regretAlwaysReveal"),
  // auto veto
  autoVetoEnabled: $("autoVetoEnabled"),
  autoVetoSubs: $("autoVetoSubs"),
  autoVetoDelay: $("autoVetoDelay"),
  autoVetoDelayValue: $("autoVetoDelayValue"),
  overridesHeader: $("overridesHeader"),
  autoVetoWorstFirstEnabled: $("autoVetoWorstFirstEnabled"),
  worstFirstFeature: $("worstFirstFeature"),
  autoVetoWorstFirstReveal: $("autoVetoWorstFirstReveal"),
  autoVetoWorstFirstGap: $("autoVetoWorstFirstGap"),
  autoVetoWorstFirstGapValue: $("autoVetoWorstFirstGapValue"),
  worstFirstExample: $("worstFirstExample"),
  autoVetoProtectFloorEnabled: $("autoVetoProtectFloorEnabled"),
  protectFloorFeature: $("protectFloorFeature"),
  autoVetoProtectFloorReveal: $("autoVetoProtectFloorReveal"),
  autoVetoProtectFloor: $("autoVetoProtectFloor"),
  autoVetoProtectFloorValue: $("autoVetoProtectFloorValue"),
  protectFloorExample: $("protectFloorExample"),
  autoVetoServers: $("autoVetoServers"),
  serverReveal: $("serverReveal"),
  zoneFirst: $("zoneFirst"),
  zoneDynamic: $("zoneDynamic"),
  zoneLast: $("zoneLast"),
  zoneServer: $("zoneServer"),
  // social
  replacePlayerCards: $("replacePlayerCards"),
  cardStatsReveal: $("cardStatsReveal"),
  showPlayerCardStats: $("showPlayerCardStats"),
  playerTrackingEnabled: $("playerTrackingEnabled"),
  spotEnabled: $("spotEnabled"),
  spotReveal: $("spotReveal"),
  spotDuo: $("spotDuo"),
  spotEditBtn: $("spotEditBtn"),
  // access warning
  accessWarn: $("accessWarn"),
  accessWarnGrant: $("accessWarnGrant"),
  accessWarnDismiss: $("accessWarnDismiss"),
};

function save(partial) {
  api.storage.local.set(partial);
}

// ---------------------------------------------------------------------------
// Reveals — animated max-height. The popup window is a fixed 400×574 with an
// internal scroll pane, so (unlike the old auto-sizing popup) opening a reveal
// only grows content inside the scroll area; no window re-measure is needed.
// ---------------------------------------------------------------------------
const REVEAL_MS = 240; // keep in sync with the .reveal transition
function setReveal(reveal, open) {
  clearTimeout(reveal._fvhTimer);
  reveal.classList.toggle("open", open); // drives the opacity/slide

  // Initial population: jump straight to the resting state, no animation.
  if (document.body.classList.contains("no-anim")) {
    reveal.style.maxHeight = open ? "none" : "0px";
    return;
  }

  if (open) {
    reveal.style.maxHeight = `${reveal.scrollHeight}px`;
  } else {
    reveal.style.maxHeight = `${reveal.offsetHeight}px`;
    void reveal.offsetHeight; // reflow so the collapse animates
    reveal.style.maxHeight = "0px";
  }

  // Settle to a clean resting height once the animation is done, so an open
  // reveal isn't pinned to a stale pixel height when its content later changes.
  reveal._fvhTimer = setTimeout(() => {
    reveal.style.maxHeight = reveal.classList.contains("open") ? "none" : "0px";
  }, REVEAL_MS + 40);
}

// ---------------------------------------------------------------------------
// Site-access warning — orthogonal to the feature toggles. Without host access
// the content script never runs, so nothing works regardless of settings.
// ---------------------------------------------------------------------------
const FACEIT_ORIGINS = ["*://*.faceit.com/*"];

// Resolve whether we currently have host access to faceit.com via `cb(granted)`.
// getAll() reflects the real user choice (host_permissions are optional-by-
// default in MV3): present when allowed, absent under "Only When Clicked". Falls
// back to contains(), then "assume granted" so we never nag when unsure.
function hasFaceitAccess(cb) {
  const perms = api.permissions;
  if (perms?.getAll) {
    perms.getAll((all) => {
      if (api.runtime?.lastError) return cb(true);
      const origins = all?.origins || [];
      cb(origins.some((o) => o.includes("faceit.com")));
    });
    return;
  }
  if (perms?.contains) {
    perms.contains({ origins: FACEIT_ORIGINS }, (granted) =>
      cb(api.runtime?.lastError ? true : granted),
    );
    return;
  }
  cb(true);
}

function refreshAccessWarning() {
  hasFaceitAccess((granted) => {
    els.accessWarn.classList.toggle("show", !granted);
  });
}

els.accessWarnGrant.addEventListener("click", () => {
  const perms = api.permissions;
  if (!perms?.request) return;
  // Must run from this click (a user gesture) or the browser rejects the prompt.
  perms.request({ origins: FACEIT_ORIGINS }, (granted) => {
    if (granted) els.accessWarn.classList.remove("show");
  });
});
els.accessWarnDismiss.addEventListener("click", () => {
  els.accessWarn.classList.remove("show");
});

// ---------------------------------------------------------------------------
// Icon rail + category navigation
// ---------------------------------------------------------------------------
let currentNav = DEFAULT_NAV;

function buildRail() {
  els.cpRail.replaceChildren(
    ...CATS.map((c) => {
      const btn = document.createElement("button");
      btn.className = "cp-rail-item";
      btn.dataset.nav = c.key;
      const ico = document.createElement("span");
      ico.className = "cp-rail-ico";
      ico.innerHTML = c.icon;
      const name = document.createElement("span");
      name.className = "cp-rail-name";
      name.textContent = c.name;
      btn.append(ico, name);
      btn.addEventListener("click", () => setNav(c.key));
      return btn;
    }),
  );
}

function setNav(key) {
  currentNav = key;
  const cat = CATS.find((c) => c.key === key) || CATS[0];
  els.cpEyebrow.textContent = cat.name;
  for (const item of els.cpRail.querySelectorAll(".cp-rail-item")) {
    item.classList.toggle("active", item.dataset.nav === key);
  }
  for (const panel of document.querySelectorAll(".cp-panel")) {
    panel.classList.toggle("active", panel.dataset.panel === key);
  }
  save({ cpNav: key });
}

// ---------------------------------------------------------------------------
// Global master switch — pauses every feature at once (content script gates on
// it). Here it just dims/disables the body row; the header switch stays live.
// ---------------------------------------------------------------------------
function reflectMaster() {
  const on = els.globalEnabled.checked;
  els.cpBody.classList.toggle("master-off", !on);
  els.masterLabel.textContent = on ? "On" : "Off";
  els.masterLabel.classList.toggle("on", on);
}
els.globalEnabled.addEventListener("change", () => {
  save({ globalEnabled: els.globalEnabled.checked });
  reflectMaster();
});

// ---------------------------------------------------------------------------
// Auto Accept
// ---------------------------------------------------------------------------
// One-time accept can't be armed while the permanent Auto accept is running, so
// it grays out (pointer-inert) and shows a note whenever Auto accept is on.
function reflectOneTime() {
  const disabled = els.autoAcceptEnabled.checked;
  els.oneTimeCard.classList.toggle("disabled", disabled);
  els.oneTimeNote.style.display = disabled ? "block" : "none";
}

els.autoAcceptEnabled.addEventListener("change", () => {
  save({ autoAcceptEnabled: els.autoAcceptEnabled.checked });
  reflectOneTime();
});
els.oneTimeAcceptEnabled.addEventListener("change", () => {
  save({ oneTimeAcceptEnabled: els.oneTimeAcceptEnabled.checked });
});
els.autoAcceptDelay.addEventListener("input", () => {
  els.delayValue.textContent = els.autoAcceptDelay.value;
});
els.autoAcceptDelay.addEventListener("change", () => {
  save({ autoAcceptDelay: Number(els.autoAcceptDelay.value) });
});

// ---------------------------------------------------------------------------
// Veto Helper
// ---------------------------------------------------------------------------
function reflectVetoLock() {
  setReveal(els.vetoLockReveal, els.vetoHelperEnabled.checked);
}
function reflectRegretLink() {
  setReveal(els.regretAlwaysReveal, els.regretHelperEnabled.checked);
}

els.vetoHelperEnabled.addEventListener("change", () => {
  const on = els.vetoHelperEnabled.checked;
  const update = { vetoHelperEnabled: on };
  // Turning the Veto helper off resets the window: clear the lock and the saved
  // position so a lost or locked-off-screen window is recoverable by toggling
  // it off and on (it returns unlocked at the default spot).
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
  if (on && !els.regretHelperEnabled.checked) {
    els.regretHelperEnabled.checked = true;
    update.regretHelperEnabled = true;
    reflectRegretLink();
  }
  save(update);
});

// ---------------------------------------------------------------------------
// Auto Veto
// ---------------------------------------------------------------------------
// The whole preference sub-panel is shown (animated) only while Auto veto is on.
function reflectAutoVetoEnabled() {
  setReveal(els.autoVetoSubs, els.autoVetoEnabled.checked);
}
function reflectWorstFirst() {
  setReveal(els.autoVetoWorstFirstReveal, els.autoVetoWorstFirstEnabled.checked);
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

// ---------------------------------------------------------------------------
// Social
// ---------------------------------------------------------------------------
function reflectCardStatsLink() {
  setReveal(els.cardStatsReveal, els.replacePlayerCards.checked);
}
function reflectSpot() {
  setReveal(els.spotReveal, els.spotEnabled.checked);
}

els.replacePlayerCards.addEventListener("change", () => {
  save({ replacePlayerCards: els.replacePlayerCards.checked });
  reflectCardStatsLink();
});
els.showPlayerCardStats.addEventListener("change", () => {
  save({ showPlayerCardStats: els.showPlayerCardStats.checked });
});
els.playerTrackingEnabled.addEventListener("change", () => {
  save({ playerTrackingEnabled: els.playerTrackingEnabled.checked });
});
els.spotEnabled.addEventListener("change", () => {
  save({ spotEnabled: els.spotEnabled.checked });
  reflectSpot();
});
els.spotDuo.addEventListener("change", () => {
  save({ spotDuo: els.spotDuo.checked });
});

// "Set map calls" opens the editor over the focused faceit.com tab (the toolbar
// popup is too small to host the 620px panel). Focus a faceit tab first, THEN
// ping — the content script there opens the editor. Focusing another window
// blurs the popup, so it closes on its own.
els.spotEditBtn.addEventListener("click", () => {
  const ping = () => api.storage.local.set({ spotEditorPing: Date.now() });
  if (!api.tabs?.query) {
    ping();
    return;
  }
  api.tabs.query({ url: "*://*.faceit.com/*" }, (tabs) => {
    if (api.runtime?.lastError || !tabs || !tabs.length) {
      api.tabs.create?.({ url: "https://www.faceit.com/" });
      ping();
      return;
    }
    const tab = tabs.find((t) => t.active) || tabs[0];
    api.tabs.update(tab.id, { active: true }, () => {
      if (tab.windowId != null && api.windows?.update) {
        api.windows.update(tab.windowId, { focused: true }, ping);
      } else {
        ping();
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Preference drag-and-drop editor (maps + servers). Native HTML5 DnD, live DOM
// reordering (no re-render), items constrained to their own group.
// ---------------------------------------------------------------------------
let mapNameById = {};
const exampleMaps = { worstFirst: null, protect: null };

function loadPools() {
  return Promise.all([
    fetch(api.runtime.getURL("mapPool.json")).then((r) => r.json()),
    fetch(api.runtime.getURL("serverPool.json")).then((r) => r.json()),
  ]).then(([maps, servers]) => ({ maps, servers }));
}

// Drop saved ids no longer in the pool; add new pool maps to the dynamic group.
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

// An item is { id, label, group, img, imgClass } — `img` is an optional icon (a
// map thumbnail or a country flag) shown before the label.
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

// Live-reordering sortable across one group of zones; items drag within and
// between them, but not into another group (maps vs servers).
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

// Re-pick the example map pair for each override from the current lists.
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

// Each override only does anything when the list it acts on has maps, so show it
// only then (with the shared header). Also refresh the worked examples.
function refreshFeatureUI() {
  pickExampleMaps();
  renderExamples();
  const hasFirst = readZone(els.zoneFirst).length > 0;
  const hasLast = readZone(els.zoneLast).length > 0;
  setReveal(els.overridesHeader, hasFirst || hasLast);
  setReveal(els.worstFirstFeature, hasFirst);
  setReveal(els.protectFloorFeature, hasLast);
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
function getSettings() {
  return new Promise((resolve) =>
    api.storage.local.get({ ...DEFAULTS, cpNav: DEFAULT_NAV }, resolve),
  );
}

function applySettings(s) {
  els.globalEnabled.checked = s.globalEnabled;
  reflectMaster();

  els.autoAcceptEnabled.checked = s.autoAcceptEnabled;
  els.oneTimeAcceptEnabled.checked = s.oneTimeAcceptEnabled;
  els.autoAcceptDelay.value = s.autoAcceptDelay;
  els.delayValue.textContent = s.autoAcceptDelay;
  reflectOneTime();

  els.vetoHelperEnabled.checked = s.vetoHelperEnabled;
  els.vetoHelperLocked.checked = s.vetoHelperLocked;
  els.regretHelperEnabled.checked = s.regretHelperEnabled;
  // Invariant: "always" only applies when the Regret Helper is on. Normalise
  // any stale state and persist the fix.
  const always = s.regretHelperAlways && s.regretHelperEnabled;
  els.regretHelperAlways.checked = always;
  if (always !== s.regretHelperAlways) save({ regretHelperAlways: always });
  reflectVetoLock();
  reflectRegretLink();

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

  els.replacePlayerCards.checked = s.replacePlayerCards;
  els.showPlayerCardStats.checked = s.showPlayerCardStats;
  els.playerTrackingEnabled.checked = s.playerTrackingEnabled;
  els.spotEnabled.checked = s.spotEnabled;
  els.spotDuo.checked = s.spotDuo;
  reflectCardStatsLink();
  reflectSpot();
}

// One combined init pass: build the rail, set every control (and reveal) to its
// stored state, THEN drop body.no-anim so the initial population never animates
// while later user toggles do. Double rAF guarantees no-anim is painted first.
buildRail();
Promise.all([loadPools(), getSettings()]).then(([pools, s]) => {
  refreshAccessWarning();
  applySettings(s);
  initEditor(s, pools);
  refreshFeatureUI(); // override visibility + worked examples (instant on load)
  setNav(CATS.some((c) => c.key === s.cpNav) ? s.cpNav : DEFAULT_NAV);
  requestAnimationFrame(() =>
    requestAnimationFrame(() => document.body.classList.remove("no-anim")),
  );
});
