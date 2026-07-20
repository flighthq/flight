// Publishes every package under packages/ to npm. The repo keeps internal @flighthq/* deps as "*" in
// source (enforced by packages:check), but a published manifest must pin its graph — otherwise a
// consumer of @flighthq/sdk@0.1.0 would float its deps to "latest" and break the moment 0.2.0 ships.
// So this rewrites each internal "*" to the exact sibling version in a temporary manifest edit,
// publishes, then restores "*" (the working tree stays packages:check-clean). This is the npm-native
// equivalent of pnpm's workspace:* protocol.
//
// All prepack scripts are the standard clean+build and there are no other publish hooks, so we build
// the whole graph once (npm run build) and publish with --ignore-scripts; the `files` field already
// excludes test outputs from the tarball. Idempotent: a package whose version is already on the
// registry is skipped, so a re-run after a partial failure completes the set.
//
// Usage:
//   tsx scripts/publish-packages.ts                 publish all to the default `latest` dist-tag
//   tsx scripts/publish-packages.ts --dry-run       pack + report, no upload
//   tsx scripts/publish-packages.ts --no-build      skip the root build (dist must already exist)
//   tsx scripts/publish-packages.ts --tag <tag>     publish under a dist-tag (e.g. edge/next), not
//                                                   `latest` — the snapshot-channel publish path
//   tsx scripts/publish-packages.ts <name-substr>   only packages whose name contains the substring

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

interface Manifest {
  name: string;
  version: string;
  private?: boolean;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  [key: string]: unknown;
}

const DEP_FIELDS = ['dependencies', 'peerDependencies', 'optionalDependencies'] as const;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const packagesDir = join(root, 'packages');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const noBuild = args.includes('--no-build');
// --tag <dist-tag> routes the publish to a channel other than `latest` (edge/next snapshots). The tag
// value is a positional-looking token, so exclude it before resolving the name-substring filter.
const tagIndex = args.indexOf('--tag');
const distTag = tagIndex === -1 ? undefined : args[tagIndex + 1];
const filter = args.find((a, i) => !a.startsWith('--') && i !== tagIndex + 1);

const manifests = readdirSync(packagesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(packagesDir, entry.name, 'package.json')))
  .map((entry) => {
    const dir = join(packagesDir, entry.name);
    const path = join(dir, 'package.json');
    return { dir, path, pkg: JSON.parse(readFileSync(path, 'utf8')) as Manifest };
  })
  .filter((m) => filter === undefined || m.pkg.name.includes(filter))
  .sort((a, b) => a.pkg.name.localeCompare(b.pkg.name));

// Version map for pinning internal deps, plus a locked-versioning sanity check: the whole graph must
// share one version, so a stray mismatch (a forgotten version:packages run) fails loudly.
const versions = new Map(manifests.map((m) => [m.pkg.name, m.pkg.version]));
const distinctVersions = [...new Set(manifests.map((m) => m.pkg.version))];
if (filter === undefined && distinctVersions.length > 1) {
  console.error(`[publish] packages are not on a single locked version: ${distinctVersions.join(', ')}`);
  console.error('[publish] run `npm run version:packages <version>` first.');
  process.exit(1);
}

if (!noBuild && !dryRun) {
  console.log('[publish] building all packages (npm run build)…');
  execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' });
}

const published: string[] = [];
const skipped: string[] = [];
const failed: string[] = [];

for (const { dir, path, pkg } of manifests) {
  const id = `${pkg.name}@${pkg.version}`;
  if (pkg.private === true) {
    skipped.push(`${pkg.name} (private)`);
    continue;
  }
  if (!dryRun && isPublished(pkg.name, pkg.version)) {
    skipped.push(`${id} (already published)`);
    continue;
  }

  const original = readFileSync(path, 'utf8');
  writeFileSync(path, `${JSON.stringify(pinInternalDependencies(pkg), null, 2)}\n`);
  try {
    const publishArgs = ['publish', '--access', 'public', '--ignore-scripts'];
    if (distTag !== undefined) publishArgs.push('--tag', distTag);
    if (dryRun) publishArgs.push('--dry-run');
    execFileSync('npm', publishArgs, { cwd: dir, stdio: 'inherit' });
    published.push(id);
  } catch (error) {
    failed.push(pkg.name);
    console.error(`[publish] FAILED ${id}: ${(error as Error).message}`);
  } finally {
    // Restore "*" so the working tree stays packages:check-clean regardless of publish outcome.
    writeFileSync(path, original);
  }
}

console.log(
  `\n[publish] ${dryRun ? '(dry run) ' : ''}published ${published.length} to ` +
    `dist-tag \`${distTag ?? 'latest'}\`, skipped ${skipped.length}, failed ${failed.length}`,
);
if (failed.length > 0) {
  console.error(`[publish] failed: ${failed.join(', ')}`);
  process.exit(1);
}

// Returns a manifest clone with every internal @flighthq/* "*" range replaced by the sibling's exact
// locked version. Non-"*" ranges and third-party deps are left untouched.
function pinInternalDependencies(pkg: Manifest): Manifest {
  const clone = JSON.parse(JSON.stringify(pkg)) as Manifest;
  for (const field of DEP_FIELDS) {
    const deps = clone[field];
    if (deps === undefined) continue;
    for (const [name, range] of Object.entries(deps)) {
      if (name.startsWith('@flighthq/') && range === '*') {
        const version = versions.get(name);
        if (version !== undefined) deps[name] = version;
      }
    }
  }
  return clone;
}

// True when this exact name@version is already on the registry. `npm view name@version version` prints
// the version when it exists, an empty string when the package exists but not that version, and exits
// non-zero (E404) when the package is unknown — all resolved to a boolean here.
function isPublished(name: string, version: string): boolean {
  try {
    const out = execFileSync('npm', ['view', `${name}@${version}`, 'version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.trim() === version;
  } catch {
    return false;
  }
}
