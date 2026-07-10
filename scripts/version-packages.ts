// Sets every package under packages/ to a single version — the locked-versioning bump run before
// tagging a release. The whole @flighthq/* graph moves together, so one version applies to all and a
// published @flighthq/sdk@X implies every dependency at X. Internal deps stay "*" in source (enforced
// by packages:check); publish-packages.ts pins them at publish time.
//
// Usage: tsx scripts/version-packages.ts <version>   (e.g. 0.1.0)

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const packagesDir = join(root, 'packages');

const version = process.argv[2];
if (version === undefined || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error('Usage: tsx scripts/version-packages.ts <version>   (e.g. 0.1.0)');
  process.exit(1);
}

const manifestPaths = readdirSync(packagesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(packagesDir, entry.name, 'package.json')))
  .map((entry) => join(packagesDir, entry.name, 'package.json'));

let changed = 0;
for (const path of manifestPaths) {
  const text = readFileSync(path, 'utf8');
  // Replace only the top-level "version" line so the diff is one line per manifest, not a reserialize.
  const updated = text.replace(/^(\s*"version":\s*")[^"]*(")/m, `$1${version}$2`);
  if (updated !== text) {
    writeFileSync(path, updated);
    changed += 1;
  }
}

console.log(`[version:packages] set ${changed}/${manifestPaths.length} packages to ${version}`);
