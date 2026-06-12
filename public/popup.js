// Control panel logic. Plain JS (MV3 blocks inline scripts) shared by Chrome
// and Firefox via the `chrome` namespace. Keep the defaults in sync with
// src/settings.js SETTINGS_DEFAULTS.
const api = globalThis.chrome ?? globalThis.browser;
const DEFAULTS = {
  autoAcceptEnabled: true,
  autoAcceptDelay: 10,
  vetoHelperEnabled: true,
};

const els = {
  autoAcceptEnabled: document.getElementById("autoAcceptEnabled"),
  autoAcceptDelay: document.getElementById("autoAcceptDelay"),
  delayValue: document.getElementById("delayValue"),
  delayRow: document.getElementById("delayRow"),
  vetoHelperEnabled: document.getElementById("vetoHelperEnabled"),
};

function save(partial) {
  api.storage.local.set(partial);
}

function reflectDelayEnabled() {
  const on = els.autoAcceptEnabled.checked;
  els.delayRow.classList.toggle("disabled", !on);
  els.autoAcceptDelay.disabled = !on;
}

api.storage.local.get(DEFAULTS, (s) => {
  els.autoAcceptEnabled.checked = s.autoAcceptEnabled;
  els.autoAcceptDelay.value = s.autoAcceptDelay;
  els.delayValue.textContent = s.autoAcceptDelay;
  els.vetoHelperEnabled.checked = s.vetoHelperEnabled;
  reflectDelayEnabled();
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
