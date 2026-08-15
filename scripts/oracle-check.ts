// The consumer gate: fetch the blessed reference bytes Flight pinned, compare today's render against
// them, and fail the run when a required cell moved (agents/render-oracle-repository.md §6, §9).
//
// This is the second half of the loop. `oracle-commission.ts` asks for bytes and `oracle-bridge.yml`
// delivers the candidate; this decides whether the render still matches what came back blessed. It is the
// only part that can actually catch a regression, and everything upstream exists to make its answer mean
// something.
//
// Three subcommands, because a capture happens BETWEEN two of them and is not this script's job:
//   fetch  → download, verify against the lock link by link, extract
//   scope  → print the capture arguments the fetched packs imply
//   check  → compare the captures that step produced, join, and set the exit code
//
// ★ THE ORDER OF VERIFICATION IS LOAD-BEARING, AND `fetch` OWNS ALL OF IT. Nothing downstream re-checks
// bytes, so a `check` run over an unverified directory would compare against whatever happens to be on
// disk. Keeping the whole chain in one step is what makes that impossible to do by accident.
//
// ★ IT NEEDS NO CREDENTIAL. Release assets are public reads over HTTPS, so unlike the commission side
// this can run on any branch, on a fork, and on untrusted code without a token in the environment.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getOracleAssetUrl, verifyOraclePackBytes, verifyOracleRelease } from './oracle-pack';
import { getOracleRequestCells, readOracleLock, readOracleRequest } from './oracle-records';
import { describeOracleComparison, joinOracleState } from './oracle-state';
import type { OracleCellInput, OracleRequestRecord } from './oracle-state';
import { readPackManifest, verifyOracleCaptures } from './oracle-verify';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ★ REPOSITORY POLICY, DECLARED WHERE A HUMAN CAN SEE IT. §6 requires a bound on how long a request may
// sit pending and deliberately offers no default, because a request that never expires turns the queue
// into a permanent skip list: the cell reports `pending` forever and nothing ever compares it.
const MAX_PENDING_DAYS = 14;

const [subcommand, ...rest] = process.argv.slice(2);
if (subcommand !== 'fetch' && subcommand !== 'scope' && subcommand !== 'check') {
  console.error('usage: oracle-check <fetch|scope|check> [--packs <dir>] [--artifacts <dir>] [--frames <n>]');
  process.exit(2);
}

const packsRoot = readOption('--packs') ?? join(__dirname, '..', '.artifacts', 'oracle-packs');
const artifactsRoot = readOption('--artifacts') ?? join(__dirname, '..', '.artifacts');
const repoRoot = join(__dirname, '..');

const lockResult = readOracleLock(join(__dirname, 'oracle-lock.json'));
if ('problems' in lockResult) {
  for (const problem of lockResult.problems) console.error(`  ${problem.kind}: ${problem.detail}`);
  console.error('oracle-check: the consumer lock is not valid');
  process.exit(1);
}
const lock = lockResult.lock;

if (subcommand === 'fetch') await fetchPacks();
else if (subcommand === 'scope') printScope();
else await check();

/**
 * Downloads and verifies the release manifest, then every pinned pack, then extracts them.
 *
 * Nothing is extracted until its bytes have been proved against the lock, so a substituted or truncated
 * asset can never leave a file behind for a later step to read as authoritative.
 */
async function fetchPacks(): Promise<void> {
  rmSync(packsRoot, { force: true, recursive: true });
  mkdirSync(packsRoot, { recursive: true });

  const manifestBytes = await download(getOracleAssetUrl(lock, 'manifest.json'));
  const release = verifyOracleRelease(manifestBytes, lock);
  if ('problems' in release) {
    for (const problem of release.problems) console.error(`  ${problem.kind}: ${problem.detail}`);
    console.error(`oracle-check: ${lock.repository}@${lock.releaseTag} does not match the lock`);
    process.exit(1);
  }
  console.log(`verified release manifest against the lock (${lock.releaseTag})`);

  for (const pack of release.packs) {
    const bytes = await download(getOracleAssetUrl(lock, pack.file));
    const problem = verifyOraclePackBytes(bytes, lock.packs[pack.id]!);
    if (problem !== null) {
      console.error(`  ${problem.kind}: ${problem.detail}`);
      console.error('oracle-check: a pinned pack did not match the lock');
      process.exit(1);
    }

    const target = join(packsRoot, pack.id);
    mkdirSync(target, { recursive: true });
    const archive = join(packsRoot, pack.file);
    writeFileSync(archive, bytes);
    execFileSync('tar', ['-xzf', archive, '-C', target]);
    rmSync(archive);
    console.log(`verified and extracted ${pack.id} (${pack.imageCount} image(s), ${bytes.length} bytes)`);
  }
}

/**
 * Prints the capture arguments the fetched packs imply, one line per subject/entry.
 *
 * ★ `--frames` IS NOT DERIVABLE FROM THE PACK AND MUST BE SUPPLIED. The pack manifest records hashes and
 * dimensions but no capture conditions, so nothing here knows which frame the blessed image was taken at.
 * Capturing at the wrong frame produces a different image and reports a regression that is really a
 * configuration mistake — so the value is required, echoed into the report, and never guessed. The
 * durable fix is for the pack manifest to carry the provenance Flight already sends in the candidate.
 */
function printScope(): void {
  const frames = readOption('--frames');
  if (frames === undefined) {
    console.error('oracle-check scope: --frames is required; it is a capture condition the pack does not record');
    process.exit(2);
  }

  const byEntry = new Map<string, Set<string>>();
  for (const identity of readPinnedIdentities()) {
    const [subject, entry, renderer] = identity.split('/');
    if (subject === undefined || entry === undefined || renderer === undefined) continue;
    const key = `${subject}/${entry}`;
    const renderers = byEntry.get(key) ?? new Set<string>();
    renderers.add(renderer);
    byEntry.set(key, renderers);
  }

  for (const [key, renderers] of byEntry) {
    const [subject, entry] = key.split('/');
    console.log(
      `--tool=${subject} --filter-exact ${entry} --renderer ${[...renderers].sort().join(',')} --frames ${frames}`,
    );
  }
}

/** Compares every pinned cell against a fresh capture, joins with the outstanding queue, and gates. */
async function check(): Promise<void> {
  const frames = readOption('--frames') ?? 'unrecorded';
  const cells: OracleCellInput[] = [];
  const problems: string[] = [];

  for (const pack of Object.keys(lock.packs)) {
    const packRoot = join(packsRoot, pack);
    const manifest = readPackManifest(join(packRoot, 'pack-manifest.json'));
    if ('problem' in manifest) {
      // Refusing here rather than proceeding with the packs that did parse: a partial corpus silently
      // verifies fewer cells than the lock requires, which is a pass that means less than it appears to.
      console.error(`  ${pack}: ${manifest.problem}`);
      console.error('oracle-check: run `npm run oracle:fetch` first, or the extracted pack is damaged');
      process.exit(1);
    }
    const verified = verifyOracleCaptures(packRoot, manifest.images, artifactsRoot);
    cells.push(...verified.cells);
    for (const problem of verified.problems) problems.push(`${problem.kind}: ${problem.identity} — ${problem.detail}`);
  }

  const result = joinOracleState({
    cells,
    maxPendingDays: MAX_PENDING_DAYS,
    policy: {
      comparisonPolicyId: readIdentity().comparisonPolicyId,
      gateOnMaxChannelDelta: true,
      maxChannelDelta: 0,
      maxFraction: 0,
    },
    requests: readOutstandingRequests(),
  });

  // The conditions are printed next to the verdict on purpose: the most likely cause of an unexpected
  // regression here is a capture taken under conditions the blessing did not use, and that is invisible
  // unless the report says which ones it used.
  const lines = [
    `oracle: ${lock.repository}@${lock.releaseTag}`,
    `policy: ${readIdentity().comparisonPolicyId} | environment: ${readIdentity().environmentId}`,
    `captured at frames=${frames}`,
    '',
  ];
  for (const cell of result.cells) {
    const comparison = cells.find((input) => input.identity === cell.identity)?.comparison;
    const detail = comparison === null || comparison === undefined ? cell.detail : describeOracleComparison(comparison);
    lines.push(`  ${cell.verdict.padEnd(19)} ${cell.identity}  ${detail}`);
  }
  if (problems.length > 0) {
    lines.push('', 'supply-chain and capture problems:');
    for (const problem of problems) lines.push(`  ${problem}`);
  }
  lines.push(
    '',
    `compared ${result.comparedCount}, pending ${result.pendingCount}, failures ${result.failures.length}`,
  );
  for (const failure of result.failures)
    lines.push(`  FAIL ${failure.kind}: ${failure.identity ?? '—'} ${failure.detail}`);
  console.log(lines.join('\n'));

  const summary = process.env['GITHUB_STEP_SUMMARY'];
  if (summary !== undefined && summary !== '') {
    writeFileSync(summary, `\n\`\`\`\n${lines.join('\n')}\n\`\`\`\n`, { flag: 'a' });
  }

  process.exit(result.failures.length > 0 ? 1 : 0);
}

/** The cells the extracted packs supply bytes for, as `subject/entry/renderer`. */
function readPinnedIdentities(): string[] {
  const identities: string[] = [];
  for (const pack of Object.keys(lock.packs)) {
    const manifest = readPackManifest(join(packsRoot, pack, 'pack-manifest.json'));
    if ('problem' in manifest) {
      console.error(`oracle-check: ${pack}: ${manifest.problem}`);
      process.exit(1);
    }
    for (const image of manifest.images) {
      identities.push(image.path.replace(/^images\//, '').replace(/\.png$/, ''));
    }
  }
  return identities;
}

/**
 * Reads the outstanding request queue, with each request's age in days.
 *
 * The age comes from the request's own `id` date suffix rather than file mtime: a fresh checkout gives
 * every file today's mtime, so an mtime-derived age would silently report every request as new and no
 * request would ever expire.
 */
function readOutstandingRequests(): OracleRequestRecord[] {
  const queue = join(repoRoot, 'oracle-requests');
  if (!existsSync(queue)) return [];
  const records: OracleRequestRecord[] = [];
  const today = Date.parse(new Date().toISOString().slice(0, 10));

  for (const file of readdirSync(queue).filter((name) => name.endsWith('.json'))) {
    const parsed = readOracleRequest(join(queue, file));
    if ('problems' in parsed) {
      for (const problem of parsed.problems) console.error(`  ${problem.kind}: ${problem.detail}`);
      console.error(`oracle-check: ${file} is not a valid request`);
      process.exit(1);
    }
    const dated = /(\d{4}-\d{2}-\d{2})$/.exec(parsed.request.id);
    const opened = dated === null ? today : Date.parse(dated[1]!);
    records.push({ ageDays: Math.max(0, Math.round((today - opened) / 86_400_000)), request: parsed.request });
    console.log(`outstanding request ${parsed.request.id}: ${getOracleRequestCells(parsed.request).join(', ')}`);
  }
  return records;
}

function readIdentity(): { comparisonPolicyId: string; environmentId: string } {
  return JSON.parse(readFileSync(join(__dirname, 'oracle-capture-identity.json'), 'utf8'));
}

function readOption(name: string): string | undefined {
  const at = rest.indexOf(name);
  return at === -1 ? undefined : rest[at + 1];
}

async function download(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) {
    console.error(`oracle-check: ${url} returned ${response.status}`);
    process.exit(1);
  }
  return new Uint8Array(await response.arrayBuffer());
}
