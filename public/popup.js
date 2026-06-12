// Control panel logic. Plain JS (MV3 blocks inline scripts) shared by Chrome
// and Firefox via the `chrome` namespace. Keep the defaults in sync with
// src/settings.js SETTINGS_DEFAULTS.
const api = globalThis.chrome ?? globalThis.browser;
const DEFAULTS = {
  autoAcceptEnabled: true,
  autoAcceptDelay: 10,
  autoAcceptBlockedMaps: [],
  vetoHelperEnabled: true,
  regretHelperEnabled: false,
};

const els = {
  autoAcceptEnabled: document.getElementById("autoAcceptEnabled"),
  autoAcceptDelay: document.getElementById("autoAcceptDelay"),
  delayValue: document.getElementById("delayValue"),
  delayRow: document.getElementById("delayRow"),
  blockMapsRow: document.getElementById("blockMapsRow"),
  blockMap1: document.getElementById("blockMap1"),
  blockMap2: document.getElementById("blockMap2"),
  vetoHelperEnabled: document.getElementById("vetoHelperEnabled"),
  regretHelperEnabled: document.getElementById("regretHelperEnabled"),
};

function save(partial) {
  api.storage.local.set(partial);
}

function reflectAutoAcceptEnabled() {
  const on = els.autoAcceptEnabled.checked;
  els.delayRow.classList.toggle("disabled", !on);
  els.blockMapsRow.classList.toggle("disabled", !on);
  els.autoAcceptDelay.disabled = !on;
  els.blockMap1.disabled = !on;
  els.blockMap2.disabled = !on;
}

// The two dropdowns together form "up to two" blocked maps. Collect their
// values, drop blanks, and de-duplicate.
function currentBlockedMaps() {
  return [...new Set([els.blockMap1.value, els.blockMap2.value].filter(Boolean))];
}

function saveBlockedMaps() {
  save({ autoAcceptBlockedMaps: currentBlockedMaps() });
}

// Fill both dropdowns from the shared map pool, then apply saved selections.
function populateMapSelects(pool, selected) {
  const optionsHtml =
    '<option value="">None</option>' +
    pool.map((m) => `<option value="${m.id}">${m.name}</option>`).join("");
  els.blockMap1.innerHTML = optionsHtml;
  els.blockMap2.innerHTML = optionsHtml;
  els.blockMap1.value = selected[0] ?? "";
  els.blockMap2.value = selected[1] ?? "";
}

async function loadMapPool() {
  try {
    const res = await fetch(api.runtime.getURL("mapPool.json"));
    return await res.json();
  } catch {
    return [];
  }
}

api.storage.local.get(DEFAULTS, async (s) => {
  els.autoAcceptEnabled.checked = s.autoAcceptEnabled;
  els.autoAcceptDelay.value = s.autoAcceptDelay;
  els.delayValue.textContent = s.autoAcceptDelay;
  els.vetoHelperEnabled.checked = s.vetoHelperEnabled;
  els.regretHelperEnabled.checked = s.regretHelperEnabled;
  reflectAutoAcceptEnabled();

  const pool = await loadMapPool();
  populateMapSelects(pool, s.autoAcceptBlockedMaps ?? []);
});

els.autoAcceptEnabled.addEventListener("change", () => {
  save({ autoAcceptEnabled: els.autoAcceptEnabled.checked });
  reflectAutoAcceptEnabled();
});

els.autoAcceptDelay.addEventListener("input", () => {
  els.delayValue.textContent = els.autoAcceptDelay.value;
});

els.autoAcceptDelay.addEventListener("change", () => {
  save({ autoAcceptDelay: Number(els.autoAcceptDelay.value) });
});

els.blockMap1.addEventListener("change", saveBlockedMaps);
els.blockMap2.addEventListener("change", saveBlockedMaps);

els.vetoHelperEnabled.addEventListener("change", () => {
  save({ vetoHelperEnabled: els.vetoHelperEnabled.checked });
});

els.regretHelperEnabled.addEventListener("change", () => {
  save({ regretHelperEnabled: els.regretHelperEnabled.checked });
});
