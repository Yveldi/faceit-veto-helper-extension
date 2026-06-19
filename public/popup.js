// Control panel logic. Plain JS (MV3 blocks inline scripts) shared by Chrome
// and Firefox via the `chrome` namespace. Keep the defaults in sync with
// src/settings.js SETTINGS_DEFAULTS.
const api = globalThis.chrome ?? globalThis.browser;
const DEFAULTS = {
  autoAcceptEnabled: true,
  autoAcceptDelay: 10,
  vetoHelperEnabled: true,
  regretHelperEnabled: false,
  regretHelperAlways: false,
  autoVetoEnabled: false,
  autoVetoDelay: 5,
  autoVetoServers: false,
  autoVetoToleranceEnabled: false,
  autoVetoTolerance: 10,
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
  regretHelperEnabled: document.getElementById("regretHelperEnabled"),
  regretHelperAlways: document.getElementById("regretHelperAlways"),
  regretAlwaysRow: document.getElementById("regretAlwaysRow"),
  autoVetoEnabled: document.getElementById("autoVetoEnabled"),
  autoVetoGroup: document.getElementById("autoVetoGroup"),
  autoVetoDelay: document.getElementById("autoVetoDelay"),
  autoVetoDelayValue: document.getElementById("autoVetoDelayValue"),
  autoVetoServers: document.getElementById("autoVetoServers"),
  autoVetoToleranceEnabled: document.getElementById("autoVetoToleranceEnabled"),
  autoVetoToleranceRow: document.getElementById("autoVetoToleranceRow"),
  autoVetoTolerance: document.getElementById("autoVetoTolerance"),
  autoVetoToleranceValue: document.getElementById("autoVetoToleranceValue"),
  prefToggle: document.getElementById("prefToggle"),
  prefEditor: document.getElementById("prefEditor"),
  zoneFirst: document.getElementById("zoneFirst"),
  zoneDynamic: document.getElementById("zoneDynamic"),
  zoneLast: document.getElementById("zoneLast"),
  zoneServer: document.getElementById("zoneServer"),
};

function save(partial) {
  api.storage.local.set(partial);
}

function reflectDelayEnabled() {
  const on = els.autoAcceptEnabled.checked;
  els.delayRow.classList.toggle("disabled", !on);
  els.autoAcceptDelay.disabled = !on;
}

// "Always show full pool" is a sub-option of the Regret Helper: it's only shown
// (and only meaningful) while the Regret Helper is on.
function reflectRegretLink() {
  els.regretAlwaysRow.classList.toggle("hidden", !els.regretHelperEnabled.checked);
}

api.storage.local.get(DEFAULTS, (s) => {
  els.autoAcceptEnabled.checked = s.autoAcceptEnabled;
  els.autoAcceptDelay.value = s.autoAcceptDelay;
  els.delayValue.textContent = s.autoAcceptDelay;
  els.vetoHelperEnabled.checked = s.vetoHelperEnabled;
  els.regretHelperEnabled.checked = s.regretHelperEnabled;
  // Invariant: "always" only applies when the Regret Helper is on. Normalise
  // any stale state and persist the fix.
  const always = s.regretHelperAlways && s.regretHelperEnabled;
  els.regretHelperAlways.checked = always;
  if (always !== s.regretHelperAlways) save({ regretHelperAlways: always });
  reflectDelayEnabled();
  reflectRegretLink();
});

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
  save({ vetoHelperEnabled: els.vetoHelperEnabled.checked });
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

function reflectTolerance() {
  els.autoVetoToleranceRow.classList.toggle(
    "hidden",
    !els.autoVetoToleranceEnabled.checked,
  );
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
});

els.autoVetoToleranceEnabled.addEventListener("change", () => {
  save({ autoVetoToleranceEnabled: els.autoVetoToleranceEnabled.checked });
  reflectTolerance();
});

els.autoVetoTolerance.addEventListener("input", () => {
  els.autoVetoToleranceValue.textContent = els.autoVetoTolerance.value;
});
els.autoVetoTolerance.addEventListener("change", () => {
  save({ autoVetoTolerance: Number(els.autoVetoTolerance.value) });
});

els.prefToggle.addEventListener("click", () => {
  const hidden = els.prefEditor.classList.toggle("hidden");
  els.prefToggle.textContent = hidden
    ? "Edit veto preferences ▾"
    : "Hide veto preferences ▴";
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

  initSortable([els.zoneFirst, els.zoneDynamic, els.zoneLast], "map", saveMaps);
  initSortable([els.zoneServer], "server", saveServers);

  // Persist the reconciled lists (first run, or pool changes) so the content
  // script always sees complete preferences.
  saveMaps();
  saveServers();
}

loadPools().then((pools) => {
  api.storage.local.get(DEFAULTS, (s) => {
    els.autoVetoEnabled.checked = s.autoVetoEnabled;
    els.autoVetoDelay.value = s.autoVetoDelay;
    els.autoVetoDelayValue.textContent = s.autoVetoDelay;
    els.autoVetoServers.checked = s.autoVetoServers;
    els.autoVetoToleranceEnabled.checked = s.autoVetoToleranceEnabled;
    els.autoVetoTolerance.value = s.autoVetoTolerance;
    els.autoVetoToleranceValue.textContent = s.autoVetoTolerance;
    reflectAutoVetoEnabled();
    reflectTolerance();
    initEditor(s, pools);
  });
});
