// Sets every package under packages/ to a single version — the locked-versioning bump run before
// tagging a release. The whole @flighthq/* graph moves together, so one version applies to all and a
// published @flighthq/sdk@X implies every dependency at X. Internal deps stay "*" in source (enforced
// by packages:check); publish-packages.ts pins them at publish time.
//
// Usage: tsx scripts/version-packages.ts <version>   (e.g. 0.1.0)

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const packagesDir = join(root, 'packages');
const packageLockPath = join(root, 'package-lock.json');
const workspaceLockKeyPattern = /^packages\/[^/]+$/;

interface PackageLockJson {
  packages?: Record<string, { version?: string }>;
}

export function getWorkspaceLockVersionMismatches(
  manifestLockKeys: readonly string[],
  lock: Readonly<PackageLockJson>,
  version: string,
): string[] {
  const lockPackages = lock.packages ?? {};
  const lockKeys = Object.keys(lockPackages).filter((key) => workspaceLockKeyPattern.test(key));
  const workspaceKeys = new Set([...manifestLockKeys, ...lockKeys]);

  const mismatches: string[] = [];
  for (const key of [...workspaceKeys].sort()) {
    const entry = lockPackages[key];
    if (entry?.version === version) continue;
    const actual = entry === undefined ? 'missing entry' : JSON.stringify(entry.version);
    mismatches.push(`${key}: expected ${JSON.stringify(version)}, got ${actual}`);
  }
  return mismatches;
}

export function hasOnlyWorkspaceVersionChanges(before: string, after: string): boolean {
  return maskWorkspaceLockVersions(before) === maskWorkspaceLockVersions(after);
}

function main(): void {
  const version = process.argv[2];
  if (version === undefined || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    console.error('Usage: tsx scripts/version-packages.ts <version>   (e.g. 0.1.0)');
    process.exit(1);
  }

  const manifestPaths = readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(packagesDir, entry.name, 'package.json')))
    .map((entry) => join(packagesDir, entry.name, 'package.json'))
    .sort();

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

  const lockBefore = readFileSync(packageLockPath, 'utf8');
  execFileSync(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['install', '--package-lock-only', '--offline', '--ignore-scripts', '--no-audit', '--no-fund'],
    { cwd: root, stdio: 'inherit' },
  );
  const lockAfter = readFileSync(packageLockPath, 'utf8');

  // The manifest-set assertion in publish-packages.ts catches a partial bump across manifests; this
  // catches a partial bump between those manifests and package-lock.json. It is one locked-version
  // rule checked on both surfaces, one file apart, so the publish guard and bump procedure agree.
  const manifestLockKeys = manifestPaths.map((path) => relative(root, dirname(path)).replaceAll('\\', '/'));
  const mismatches = getWorkspaceLockVersionMismatches(
    manifestLockKeys,
    JSON.parse(lockAfter) as PackageLockJson,
    version,
  );
  if (mismatches.length > 0) {
    console.error(`[version:packages] package-lock verification failed for ${mismatches.length} workspace entries:`);
    for (const mismatch of mismatches) console.error(`  - ${mismatch}`);
    process.exit(1);
  }
  console.log(`[version:packages] verified ${manifestLockKeys.length} package-lock workspace versions at ${version}`);

  if (hasOnlyWorkspaceVersionChanges(lockBefore, lockAfter)) {
    console.log('[version:packages] package-lock drift is limited to packages/* version fields');
  } else {
    console.warn(
      '[version:packages] WARNING: package-lock drift extends beyond packages/* version fields; ' +
        'this is a signal to stop and look, not to commit the lockfile blindly',
    );
  }
}

function maskWorkspaceLockVersions(text: string): string {
  let inPackages = false;
  let inWorkspaceEntry = false;

  return text
    .split('\n')
    .map((line) => {
      const comparableLine = line.endsWith('\r') ? line.slice(0, -1) : line;
      if (comparableLine === '  "packages": {') {
        inPackages = true;
        return line;
      }
      if (inPackages && /^  }[,]?$/.test(comparableLine)) {
        inPackages = false;
        inWorkspaceEntry = false;
        return line;
      }

      const packageEntryMatch = inPackages ? /^    "([^"]+)": \{$/.exec(comparableLine) : null;
      if (packageEntryMatch !== null) {
        inWorkspaceEntry = workspaceLockKeyPattern.test(packageEntryMatch[1]);
        return line;
      }
      if (!inWorkspaceEntry || !/^      "version": "[^"]*",?$/.test(comparableLine)) return line;
      return line.replace(/("version": ")[^"]*(")/, '$1<workspace-version>$2');
    })
    .join('\n');
}

if (resolve(process.argv[1] ?? '') === resolve(fileURLToPath(import.meta.url))) main();
