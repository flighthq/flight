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
// The graph is ~141 packages and every publish is network-bound, so both registry phases run
// CONCURRENTLY rather than one package at a time:
//
//   Existence check. Previously one `npm view` per package, serially. That cost ~0.69s each — but a
//                    registry round trip is only ~0.13s, so ~80% of it was npm CLI cold start paid
//                    141 times (~98s total). It is now one batched pass of plain registry GETs
//                    against the configured registry: ~3s for the same answer.
//   Publish.         A bounded worker pool instead of a serial loop. Output is captured per package
//                    and printed on completion — interleaving 141 live `npm publish` streams would
//                    be unreadable — so a failure still shows that package's full stderr.
//
// Concurrency is deliberately bounded (not unbounded Promise.all): the registry rate-limits publishes,
// and a 429 burst would turn a fast publish into a half-published graph. 429s are retried with
// backoff; override the width with FLIGHT_PUBLISH_CONCURRENCY when diagnosing.
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

const execFileAsync = promisify(execFile);

// Wide enough to hide per-publish latency, narrow enough to stay under the registry's publish rate
// limit. Raising this trades a faster publish for a higher chance of 429 backoff.
const PUBLISH_CONCURRENCY = Number(process.env.FLIGHT_PUBLISH_CONCURRENCY ?? '8');
const REGISTRY_CHECK_CONCURRENCY = 12;
const RATE_LIMIT_ATTEMPTS = 4;

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

const candidates = manifests.filter(({ pkg }) => {
  if (pkg.private === true) {
    skipped.push(`${pkg.name} (private)`);
    return false;
  }
  return true;
});

// One batched pass instead of a serial `npm view` per package. Skipped entirely on --dry-run, which
// uploads nothing and so has no reason to ask the registry what already exists.
const alreadyPublished = dryRun ? new Set<string>() : await findPublishedVersions(candidates);
const queue = candidates.filter(({ pkg }) => {
  const id = `${pkg.name}@${pkg.version}`;
  if (alreadyPublished.has(id)) {
    skipped.push(`${id} (already published)`);
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

// Returns the set of "name@version" ids already on the registry, checked concurrently.
//
// This replaces a per-package `npm view`, whose cost was dominated by npm CLI startup rather than the
// request. It asks the registry directly for each package document and looks for the version key.
// The registry URL comes from npm config rather than being hardcoded, so a private or mirrored
// registry still resolves; the packages publish with --access public, so an unauthenticated read is
// sufficient. A packument fetch that fails for any reason (404 for a never-published name, or a
// transient error) is treated as NOT published — the publish attempt itself is then the authority,
// and it fails loudly rather than silently skipping a package that should have shipped.
async function findPublishedVersions(entries: readonly PackageEntry[]): Promise<Set<string>> {
  const registry = getRegistry();
  const found = new Set<string>();
  await runPool(entries, REGISTRY_CHECK_CONCURRENCY, async ({ pkg }) => {
    // Scoped names carry a literal "/" that must not be read as a path separator.
    const url = `${registry}/${pkg.name.replace('/', '%2f')}`;
    try {
      // The abbreviated packument is a fraction of the full document and still carries every version.
      const response = await fetch(url, {
        headers: { accept: 'application/vnd.npm.install-v1+json' },
      });
      if (!response.ok) return;
      const doc = (await response.json()) as { versions?: Record<string, unknown> };
      if (doc.versions?.[pkg.version] !== undefined) found.add(`${pkg.name}@${pkg.version}`);
    } catch {
      // Treated as not-published; see the note above.
    }
  });
  return found;
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
        // Output is captured rather than inherited: 141 concurrent npm streams would interleave into
        // noise. Success prints one line; a failure prints that package's full stderr below.
        await execFileAsync('npm', publishArgs, { cwd: dir });
        published.push(id);
        console.log(`[publish] ok ${id}`);
        return;
      } catch (error) {
        const detail = describeExecError(error);
        // The registry rate-limits publishes; at this width a 429 is an expected, retryable event
        // rather than a real failure. Anything else fails immediately — retrying a bad tarball or a
        // rejected version only delays the report.
        if (!isRateLimited(detail) || attempt === RATE_LIMIT_ATTEMPTS) throw error;
        const backoffMs = 1000 * 2 ** (attempt - 1);
        console.warn(`[publish] rate-limited ${id}, retrying in ${backoffMs}ms (${attempt}/${RATE_LIMIT_ATTEMPTS})`);
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

function isRateLimited(detail: string): boolean {
  return /\b429\b|too many requests|rate limit/i.test(detail);
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
