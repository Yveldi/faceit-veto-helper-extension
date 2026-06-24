// Writes a single version into package.json and public/manifest.json so the
// git tag is the one source of truth for the published store version. Used by
// the release CI (.github/workflows/release.yml) but also runnable locally:
//   node scripts/set-version.mjs 1.3.0
import { readFileSync, writeFileSync } from 'node:fs'

const raw = process.argv[2]
if (!raw) {
  console.error('Usage: node scripts/set-version.mjs <version>  (e.g. 1.3.0)')
  process.exit(1)
}

// Accept either "v1.3.0" (a git tag) or a bare "1.3.0".
const version = raw.replace(/^v/, '')
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`Refusing to set a non x.y.z version: "${version}"`)
  process.exit(1)
}

for (const file of ['package.json', 'public/manifest.json']) {
  const json = JSON.parse(readFileSync(file, 'utf8'))
  json.version = version
  writeFileSync(file, JSON.stringify(json, null, 2) + '\n')
  console.log(`Set ${file} -> ${version}`)
}
