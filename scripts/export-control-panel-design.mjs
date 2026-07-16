// Export the toolbar control panel (public/popup.html + popup.js) as a
// self-contained static HTML snapshot that Claude Design can open as a .dc.html
// design source. The live popup builds its drag zones, reveals and worked
// examples at runtime via popup.js + chrome.storage, which a static design tool
// can't run — so this bakes a fully-EXPANDED representative state (every toggle
// on, every reveal open, the preference editor populated) directly into the
// markup, reusing the popup's own <style> (fonts + CSS) verbatim for fidelity.
//
// Re-run after changing popup.html/popup.js or the pools:
//   node scripts/export-control-panel-design.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const b64 = (p) => fs.readFileSync(path.join(root, p)).toString("base64");

const html = read("public/popup.html");

// 1. The whole <style> block (Play @font-faces + all component CSS), verbatim.
const style = html.slice(html.indexOf("<style>"), html.indexOf("</style>") + 8);

// 2. The <body> markup, which we then mutate into its expanded static state.
let body = html.slice(html.indexOf("<body"), html.indexOf("</body>"));

const maps = JSON.parse(read("src/mapPool.json"));
const servers = JSON.parse(read("src/serverPool.json"));
const mapById = Object.fromEntries(maps.map((m) => [m.id, m]));

const logo = "data:image/png;base64," + b64("public/icons/icon-128.png");
// Flags live in dist/ (copied there by the Vite pool plugin); inline them so the
// exported file is portable with no sibling asset folder.
const flag = (code) =>
  "data:image/svg+xml;base64," + b64(path.join("dist/flags", `${code}.svg`));

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Mirror popup.js makeItem() output exactly.
const mapItem = (id) =>
  `<div class="dd-item" draggable="true" data-id="${id}" data-group="map">` +
  `<img class="dd-thumb" src="${mapById[id].thumbnail}" alt="" draggable="false">` +
  `<span>${esc(mapById[id].name)}</span></div>`;
const srvItem = (s) =>
  `<div class="dd-item" draggable="true" data-id="${esc(s.name)}" data-group="server">` +
  `<img class="dd-flag" src="${flag(s.code)}" alt="" draggable="false">` +
  `<span>${esc(s.name)}</span></div>`;

// A representative split so BOTH win-odds overrides (which only appear when their
// list is non-empty) render with a real worked example.
const first = ["de_dust2"];
const last = ["de_nuke"];
const dynamic = maps.map((m) => m.id).filter((id) => ![...first, ...last].includes(id));

const fillZone = (zoneId, items) => {
  body = body.replace(
    `id="${zoneId}"></div>`,
    `id="${zoneId}">\n          ${items.join("\n          ")}\n        </div>`,
  );
};
fillZone("zoneFirst", first.map(mapItem));
fillZone("zoneDynamic", dynamic.map(mapItem));
fillZone("zoneLast", last.map(mapItem));
fillZone("zoneServer", servers.map(srvItem));

// Worked examples, mirroring popup.js renderExample() with gap = 10 (base 40,
// high 50). worst-first: player's map is the better one, the other is banned
// first. protect: the protected map is the worse one and gets banned.
const exWorst =
  `e.g. <span class="ex-map">Dust2</span> <span class="ex-hi">50%</span>` +
  ` vs <span class="ex-map">Mirage</span> <span class="ex-lo">40%</span>` +
  ` → ban <span class="ex-ban">Mirage first</span>`;
const exProt =
  `e.g. <span class="ex-map">Nuke</span> <span class="ex-lo">40%</span>` +
  ` vs <span class="ex-map">Mirage</span> <span class="ex-hi">50%</span>` +
  ` → ban <span class="ex-ban">Nuke</span>`;
body = body
  .replace(`<div class="ex" id="worstFirstExample"></div>`, `<div class="ex" id="worstFirstExample">${exWorst}</div>`)
  .replace(`<div class="ex" id="protectFloorExample"></div>`, `<div class="ex" id="protectFloorExample">${exProt}</div>`);

// Check the toggles whose sub-panels we want visible.
for (const id of [
  "autoAcceptEnabled",
  "vetoHelperEnabled",
  "regretHelperEnabled",
  "replacePlayerCards",
  "showPlayerCardStats",
  "autoVetoEnabled",
  "autoVetoServers",
  "autoVetoWorstFirstEnabled",
  "autoVetoProtectFloorEnabled",
]) {
  body = body.replace(new RegExp(`(id="${id}")\\s*/>`), `$1 checked />`);
}

// Open every reveal (add .open so .reveal-content fades in, plus a resting
// max-height since JS normally sets it).
for (const id of [
  "vetoLockReveal",
  "regretAlwaysReveal",
  "cardStatsReveal",
  "autoVetoWorstFirstReveal",
  "autoVetoProtectFloorReveal",
  "serverReveal",
]) {
  body = body.replace(
    `class="reveal" id="${id}"`,
    `class="reveal open" id="${id}" style="max-height:none"`,
  );
}

// Open the editor panel + the collapsible override wrappers (not .reveal-based).
body = body.replace(
  `class="pref-editor" id="prefEditor"`,
  `class="pref-editor" id="prefEditor" style="max-height:none"`,
);
for (const id of ["overridesHeader", "worstFirstFeature", "protectFloorFeature"]) {
  body = body.replace(
    `class="feature-collapse" id="${id}"`,
    `class="feature-collapse" id="${id}" style="max-height:none"`,
  );
}
body = body.replace("Edit veto preferences ▾", "Hide veto preferences ▴");

// Static-file cleanups: drop the load-time no-anim guard, inline the logo,
// remove the runtime script tag.
body = body
  .replace(`<body class="no-anim">`, `<body>`)
  .replace(`src="icons/icon-128.png"`, `src="${logo}"`)
  .replace(/\n\s*<script src="popup\.js"><\/script>/, "");

const out = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Faceit Veto Helper — Control Panel</title>
    ${style.trim()}
  </head>
  ${body}</body>
</html>
`;

const dest = "Faceit Control Panel.dc.html";
fs.writeFileSync(path.join(root, dest), out);
console.log(`wrote ${dest} (${out.length} bytes)`);
