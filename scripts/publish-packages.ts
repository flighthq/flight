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
// A package is also skipped when the target dist-tag already points at a NEWER version, because
// `npm publish --tag` moves that tag and npm offers no publish-without-a-tag. Two builds whose CI
// legs finish out of commit order would otherwise leave `next` pointing at the older snapshot. The
// guard compares against the registry rather than the branch tip on purpose: a tip comparison
// starves under burst commits (every run sees a newer tip and skips, so nothing ever publishes),
// whereas this one always lets the first build to reach the registry win. See
// snapshot-version-order.ts.
//
// The graph is more than 150 packages and every publish is network-bound, so both registry phases run
// CONCURRENTLY rather than one package at a time:
//
//   Existence check. Previously one `npm view` per package, serially. That cost ~0.69s each — but a
//                    registry round trip is only ~0.13s, so ~80% of it was npm CLI cold start paid
//                    for every package. It is now one batched pass of plain registry GETs
//                    against the configured registry: ~3s for the same answer.
//   Publish.         A bounded worker pool instead of a serial loop. Output is captured per package
//                    and printed on completion — interleaving every live `npm publish` stream would
//                    be unreadable — so a failure still shows that package's full stderr.
//
// Concurrency is deliberately bounded (not unbounded Promise.all): the registry rate-limits publishes,
// and a 429 burst would turn a fast publish into a half-published graph. Override the width with
// FLIGHT_PUBLISH_CONCURRENCY when diagnosing.
//
// Running npm concurrently also makes it fail for reasons unrelated to the package being published —
// throttling, and npm racing itself during startup. Those are retried with backoff, and a real
// rejection is not; classifyPublishError draws that line and publish-error-kind.test.ts pins it
// against the stderr actually observed in CI. Retrying is only safe because a publish that already
// landed is recognised as done rather than as a conflict.
//
// Usage:
//   tsx scripts/publish-packages.ts                 publish all to the default `latest` dist-tag
//   tsx scripts/publish-packages.ts --dry-run       pack + report, no upload
//   tsx scripts/publish-packages.ts --no-build      skip the root build (dist must already exist)
//   tsx scripts/publish-packages.ts --tag <tag>     publish under a dist-tag (e.g. edge/next), not
//                                                   `latest` — the snapshot-channel publish path
//   tsx scripts/publish-packages.ts <name-substr>   only packages whose name contains the substring

import { execFile, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { withTemporaryPublishArtifacts } from './package-publish-artifacts.js';
import { classifyPublishError } from './publish-error-kind.js';
import { isSnapshotVersionSuperseded } from './snapshot-version-order.js';

const execFileAsync = promisify(execFile);

// Wide enough to hide per-publish latency, narrow enough to stay under the registry's publish rate
// limit. Raising this trades a faster publish for a higher chance of 429 backoff.
const PUBLISH_CONCURRENCY = Number(process.env.FLIGHT_PUBLISH_CONCURRENCY ?? '8');
const REGISTRY_CHECK_CONCURRENCY = 12;
const RETRY_ATTEMPTS = 4;

// npm prunes its log directory (~/.npm/_logs, honouring `logs-max`) on every startup, and concurrent
// npm processes readdir and unlink the same files there. Losing that race makes npm die before it
// finishes resolving config — the "Exit prior to config file resolving" crash, which is not a
// publish failure at all but takes the package down with it. Writing no log files removes the shared
// state being contended. Nothing is lost: each publish's output is already captured per package, so
// the log files were never the diagnostic path here.
//
// This reduces the race rather than proving it gone, so classifyPublishError still retries the crash
// if it appears by another route.
const PUBLISH_ENV = { ...process.env, npm_config_logs_max: '0' };

interface Manifest {
  name: string;
  version: string;
  private?: boolean;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  [key: string]: unknown;
}

interface PackageEntry {
  dir: string;
  path: string;
  pkg: Manifest;
}

interface RegistryEntry {
  // This exact version is already on the registry.
  hasVersion: boolean;
  // What the target dist-tag currently points at, or undefined when the tag does not exist yet.
  tagVersion: string | undefined;
}

const DEP_FIELDS = ['dependencies', 'peerDependencies', 'optionalDependencies'] as const;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const packagesDir = join(root, 'packages');
const rootReadme = readFileSync(join(root, 'README.md'), 'utf8');
const license = readFileSync(join(root, 'LICENSE.md'), 'utf8');
const sourceRef = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const noBuild = args.includes('--no-build');
// --tag <dist-tag> routes the publish to a channel other than `latest` (edge/next snapshots). The tag
// value is a positional-looking token, so exclude it before resolving the name-substring filter.
const tagIndex = args.indexOf('--tag');
const distTag = tagIndex === -1 ? undefined : args[tagIndex + 1];
// The dist-tag this run will actually move. npm defaults to `latest` when --tag is absent, so the
// backwards-move guard covers the stable release path (release.yml) on the same terms as edge/next.
const targetTag = distTag ?? 'latest';
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

const candidates = manifests.filter(({ pkg }) => {
  if (pkg.private === true) {
    skipped.push(`${pkg.name} (private)`);
    return false;
  }
  return true;
});

// One batched pass instead of a serial `npm view` per package. Skipped entirely on --dry-run, which
// uploads nothing and so has no reason to ask the registry what already exists.
const registryState = dryRun ? new Map<string, RegistryEntry>() : await readRegistryState(candidates);

// In a locked-version monorepo, superseding any package supersedes the whole graph. A new package
// (no dist-tag yet) would otherwise slip through and publish at a lower version than its siblings,
// creating an inconsistent dependency graph: its pinned deps reference the lower version, but a
// consumer resolving those deps via the dist-tag gets the higher one. The publish is all-or-nothing
// at the graph level, not per-package.
let graphSuperseded = false;
let graphSupersededBy: string | undefined;
for (const { pkg } of candidates) {
  const state = registryState.get(pkg.name);
  if (state?.tagVersion !== undefined && isSnapshotVersionSuperseded(pkg.version, state.tagVersion)) {
    graphSuperseded = true;
    graphSupersededBy = state.tagVersion;
    break;
  }
}

const queue = candidates.filter(({ pkg }) => {
  const id = `${pkg.name}@${pkg.version}`;
  const state = registryState.get(pkg.name);
  if (state?.hasVersion === true) {
    skipped.push(`${id} (already published)`);
    return false;
  }
  if (graphSuperseded) {
    skipped.push(`${id} (superseded — \`${targetTag}\` is already at ${graphSupersededBy})`);
    return false;
  }
  return true;
});

console.log(`[publish] ${queue.length} to publish, ${skipped.length} skipped; ` + `concurrency ${PUBLISH_CONCURRENCY}`);
await runPool(queue, PUBLISH_CONCURRENCY, publishOne);

console.log(
  `\n[publish] ${dryRun ? '(dry run) ' : ''}published ${published.length} to ` +
    `dist-tag \`${distTag ?? 'latest'}\`, skipped ${skipped.length}, failed ${failed.length}`,
);
console.log(`[publish] skipped by reason: ${skipped.length === 0 ? '0 skipped' : summarizeSkipReasons(skipped)}`);
if (failed.length > 0) {
  console.error(`[publish] failed: ${failed.join(', ')}`);
  process.exit(1);
}
if (!dryRun && targetTag === 'latest' && published.length === 0) {
  console.error(
    '[publish] stable release published zero packages: nothing was published. ' +
      'This is expected for a rerun of an already-complete release; otherwise the package version bump was missed.',
  );
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

// Reads, concurrently, the two facts the publish decision needs per package: whether this exact
// version is already on the registry, and what the target dist-tag currently points at.
//
// This replaces a per-package `npm view`, whose cost was dominated by npm CLI startup rather than the
// request. It asks the registry directly for each package document. Both facts come from the SAME
// abbreviated packument, so the dist-tag guard costs no additional requests. The registry URL comes
// from npm config rather than being hardcoded, so a private or mirrored registry still resolves; the
// packages publish with --access public, so an unauthenticated read is sufficient.
//
// A packument fetch that fails for any reason (404 for a never-published name, or a transient error)
// leaves the package absent from the map, which reads as neither published nor superseded — the
// publish attempt itself is then the authority, and it fails loudly rather than silently skipping a
// package that should have shipped.
async function readRegistryState(entries: readonly PackageEntry[]): Promise<Map<string, RegistryEntry>> {
  const registry = getRegistry();
  const state = new Map<string, RegistryEntry>();
  await runPool(entries, REGISTRY_CHECK_CONCURRENCY, async ({ pkg }) => {
    // Scoped names carry a literal "/" that must not be read as a path separator.
    const url = `${registry}/${pkg.name.replace('/', '%2f')}`;
    try {
      // The abbreviated packument is a fraction of the full document and still carries both the full
      // version list and the dist-tags.
      const response = await fetch(url, {
        headers: { accept: 'application/vnd.npm.install-v1+json' },
      });
      if (!response.ok) return;
      const doc = (await response.json()) as {
        versions?: Record<string, unknown>;
        'dist-tags'?: Record<string, string>;
      };
      state.set(pkg.name, {
        hasVersion: doc.versions?.[pkg.version] !== undefined,
        tagVersion: doc['dist-tags']?.[targetTag],
      });
    } catch {
      // Left absent from the map; see the note above.
    }
  });
  return state;
}

// The effective registry, trailing slash trimmed so callers can join with "/" unconditionally.
function getRegistry(): string {
  const configured = execFileSync('npm', ['config', 'get', 'registry'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  return configured.replace(/\/+$/, '');
}

// Publishes one package: pin its internal deps, upload, restore. The pin/restore window is per-file,
// so concurrent workers never contend — each touches only its own package.json.
async function publishOne({ dir, path, pkg }: PackageEntry): Promise<void> {
  const id = `${pkg.name}@${pkg.version}`;
  const publishArgs = ['publish', '--access', 'public', '--ignore-scripts'];
  if (distTag !== undefined) publishArgs.push('--tag', distTag);
  if (dryRun) publishArgs.push('--dry-run');

  const original = readFileSync(path, 'utf8');
  writeFileSync(path, `${JSON.stringify(pinInternalDependencies(pkg), null, 2)}\n`);
  try {
    for (let attempt = 1; ; attempt++) {
      try {
        // Output is captured rather than inherited: more than 150 concurrent npm streams would interleave into
        // noise. Success prints one line; a failure prints that package's full stderr below.
        await withTemporaryPublishArtifacts(
          { packageDir: dir, manifest: pkg, rootReadme, license, sourceRef },
          async () => execFileAsync('npm', publishArgs, { cwd: dir, env: PUBLISH_ENV }),
        );
        published.push(id);
        console.log(`[publish] ok ${id}`);
        return;
      } catch (error) {
        const detail = describeExecError(error);
        const kind = classifyPublishError(detail);
        // A retry can follow an attempt that actually landed before its error surfaced, so the
        // version being present is success, not conflict. Without this, retrying would convert a
        // completed publish into a hard failure.
        if (kind === 'already-published') {
          skipped.push(`${id} (already published)`);
          console.log(`[publish] ok ${id} (already on the registry)`);
          return;
        }
        // 'fatal' covers a rejected version, a bad tarball, missing auth — retrying only delays the
        // report. Everything retryable is a property of the environment, not of this package.
        if (kind === 'fatal' || attempt === RETRY_ATTEMPTS) throw error;
        const backoffMs = 1000 * 2 ** (attempt - 1);
        console.warn(`[publish] ${kind} ${id}, retrying in ${backoffMs}ms (${attempt}/${RETRY_ATTEMPTS})`);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
  } catch (error) {
    failed.push(pkg.name);
    console.error(`[publish] FAILED ${id}\n${describeExecError(error)}`);
  } finally {
    // Restore "*" so the working tree stays packages:check-clean regardless of publish outcome.
    writeFileSync(path, original);
  }
}

// execFile rejects with stdout/stderr attached; surface them, since the message alone is just the
// command line and exit code.
function describeExecError(error: unknown): string {
  const e = error as { stderr?: string; stdout?: string; message?: string };
  return [e.stderr, e.stdout, e.message].filter((s) => s !== undefined && s !== '').join('\n');
}

// Bounded-concurrency map. Workers pull from a shared cursor, so a slow item never leaves the pool
// idle the way a fixed chunking scheme would.
async function runPool<T>(items: readonly T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const width = Math.max(1, Math.min(limit, items.length));
  await Promise.all(
    Array.from({ length: width }, async () => {
      while (cursor < items.length) {
        const item = items[cursor++];
        if (item !== undefined) await worker(item);
      }
    }),
  );
}

function summarizeSkipReasons(entries: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const match = / \((.+)\)$/.exec(entry);
    const reason = match?.[1] ?? entry;
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([reason, count]) => `${count} ${reason}`)
    .join(', ');
}
