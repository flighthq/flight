// `npm run fixtures <pack> [<pack>...]` — fetch conformance fixture packs into a local, gitignored
// cache, verified against the manifest's sha256 on every run, and unpack the ones asked for. The
// decision logic lives in `fixtures-core.ts`; this file is the filesystem, the network, and the CLI.
//
// This is the fetcher and only the fetcher. It builds no conformance test, no scoreboard, and no
// oracle.
//
// WHY THIS IS NOT `download-assets.ts`. That downloader is `{url, path}` per file, skip-if-present,
// with no hash verification, feeding examples through the vite asset cache. Different job: this one
// fetches archives, must verify every byte, and must stay reproducible across releases. The one thing
// held in common is where a cache belongs — `asset-cache.ts` puts its pool at `.cache/assets`, so the
// fixture pool sits beside it at `.cache/fixtures`.
//
// THE LICENCE BOUNDARY, STATED HERE SO THE NEXT PHASE INHERITS IT RATHER THAN DISCOVERING IT AFTER
// CAPTURING FOUR HUNDRED BASELINE IMAGES. Pushing someone's real file through an importer to check
// that Flight reads it correctly is USE, not incorporation — which is exactly why fixtures may be
// fetched at all. Nothing about the input is restricted, and that is the point: THE BOUNDARY MOVES TO
// THE OUTPUTS.
//
//   - Committable: counts, references, and hashes. A fixture path names a file without carrying its
//     bytes. A hash of a render is a number. A pass/fail tally is a number.
//   - Not committable: anything carrying fixture content. A rendered image of fixture artwork, a
//     serialized scene dump, a diagnostic string quoting sample text — each is incorporation no matter
//     which pipeline stage produced it.
//
// ⇒ Conformance oracles over these packs must be hash-based or property-based, NEVER golden-file-based.
//
// AND THE EXTRACTED TREE IS NOT ALL FIXTURES. A pack root carries its own metadata alongside the corpus
// — a `LICENSES/` directory, `NOTICE.md`, `README.md`, and a per-pack `manifest.json`. In a gitignored
// fetch cache that is exactly right and needs no handling: none of it is incorporated. What must never
// happen is a later step copying, vendoring, or concatenating any of it INTO the repository, which is
// the one action that would convert a fetched tree into an attribution obligation. Read the corpus in
// place; copy nothing out.
//
// That metadata is also why a pack's `files` count is not its archive entry count: `files` counts the
// FIXTURES. `swf-ruffle-fixtures` unpacks 16,650 entries against a recorded 16,639, and `atf-fixtures`
// 17 against 14 — in both the difference is exactly that pack's metadata entries. THE COUNT VARIES PER
// PACK (11 and 3 here, since only some packs carry a `LICENSES/` directory), so a completeness check
// built on `files` versus a recursive count of the tree cannot subtract a constant; it has to exclude
// the metadata by name or it reports a phantom shortfall on every pack.
//
// And the inverse rule, which is easy to get backwards: record how to OBTAIN and how to VERIFY — the
// URL, the pinned tag, the sha256 — and record nothing about whose terms any pack carries. The
// published manifest states no terms anywhere; this file states none either, and no variant name may be
// read as implying any.
//
// ONE MORE RULE PHASE 2 INHERITS THE MOMENT THESE FIXTURES BECOME REACHABLE: A BASELINE MAY NOT BE
// CAPTURED WHILE A KNOWN FIX TO THE THING IT MEASURES IS OUTSTANDING. A baseline captured over a known
// defect is worse than no baseline, because it promotes the bug to the definition of correct and
// nothing downstream can tell the difference afterwards. Fix first, then capture.
//
// NOTHING HERE RUNS IMPLICITLY. No `pretest`, `predev`, `prebuild`, or `posttest` hook invokes this
// script, and none may be added: a gigabyte of fixtures downloading because someone typed `npm test` is
// the behaviour this rule exists to prevent. Fetching is always a step a person asks for by name.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

import type { FixturePackEntry, FixturePlan } from './fixtures-core';
import {
  crossCheckFixtureChecksums,
  crossCheckFixtureTag,
  formatFixturePlan,
  parseFixtureChecksums,
  parseFixtureManifest,
  planFixtureFetch,
} from './fixtures-core';

// The one place the release is pinned. NEVER `latest`: a fixture set that moves under the tests makes
// every future conformance number irreproducible, and the failure is silent — the score just changes.
export const FIXTURE_RELEASE_TAG = '0.1.0';

export const FIXTURE_RELEASE_BASE_URL = 'https://github.com/flighthq/flight-oracles/releases/download';

// Written into every extraction tree. A tree that cannot say which tag and which variant produced it is
// a tree two runs can disagree about without either being able to tell.
export interface FixtureTreeStamp {
  packs: readonly FixtureTreeStampPack[];
  tag: string;
  variant: string;
}

export interface FixtureTreeStampPack {
  file: string;
  files: number;
  pack: string;
  sha256: string;
}

export const FIXTURE_STAMP_FILE = '.flight-fixtures.json';

// Unpack one verified pack into its tree. Extraction is delegated to `tar` rather than reimplemented:
// these are third-party archives that may carry long paths through extended headers, and a
// hand-rolled reader that mishandles one silently drops files from a conformance corpus.
export function extractFixturePack(archivePath: string, treeDirectory: string): void {
  mkdirSync(treeDirectory, { recursive: true });
  execFileSync('tar', ['-xzf', archivePath, '-C', treeDirectory], { stdio: 'pipe' });
}

// Where a verified pack's bytes live, addressed purely by content.
//
// KEYING BY HASH RATHER THAN BY FILENAME IS WHAT MAKES A RELEASE BUMP CHEAP. Every published asset name
// embeds the tag (`atf-fixtures-full-0.1.0.tar.gz`), so a filename-keyed cache re-downloads all 28 packs
// on every bump even when the bytes never changed. The hash is the only name that stays put.
export function getFixtureArchivePath(cacheDirectory: string, sha256: string): string {
  return join(cacheDirectory, 'packs', `${sha256}.tar.gz`);
}

export function getFixturePackUrl(entry: Readonly<FixturePackEntry>): string {
  return `${FIXTURE_RELEASE_BASE_URL}/${FIXTURE_RELEASE_TAG}/${entry.file}`;
}

// Extraction trees are separated by variant so two variants of one pack can coexist and can never be
// mistaken for each other — the same reason the variant is stamped into the tree's own manifest.
export function getFixtureTreePath(cacheDirectory: string, variant: string, tree: string): string {
  return join(cacheDirectory, 'extracted', variant, tree);
}

// Streamed rather than buffered: the largest pack is 472 MB, and reading it into one Buffer to hash it
// would cost more memory than the whole run otherwise needs.
export async function hashFixtureFile(path: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(path), hash);
  return hash.digest('hex');
}

export function readFixtureTreeStamp(treeDirectory: string): FixtureTreeStamp | null {
  const path = join(treeDirectory, FIXTURE_STAMP_FILE);
  if (!existsSync(path)) return null;
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { packs, tag, variant } = parsed as Partial<FixtureTreeStamp>;
    if (typeof tag !== 'string' || typeof variant !== 'string' || !Array.isArray(packs)) return null;
    return { packs, tag, variant };
  } catch {
    return null;
  }
}

// The cache root. `FLIGHT_FIXTURES_DIR` moves the whole pool off the workspace mount, which is not a
// convenience: 26,461 files landing under an agent sandbox mount has exhausted file descriptors here on
// smaller trees, and CI wants the pool on a volume it controls.
export function resolveFixtureCacheDirectory(): string {
  const override = process.env['FLIGHT_FIXTURES_DIR'];
  if (override !== undefined && override.length > 0) return resolve(override);
  return join(repositoryRoot, '.cache', 'fixtures');
}

// Hash the bytes on disk and compare against the manifest. Returns the actual hash on mismatch and null
// on agreement, so the caller can name BOTH hashes in the failure.
//
// THIS RUNS ON A WARM CACHE TOO, EVERY TIME, AND THERE IS NO FLAG TO SKIP IT. A content-addressed
// filename is a CLAIM about the bytes; only hashing them checks it. A cache file that decayed on disk,
// or was edited, is exactly the case a name-based cache hit would wave through.
export async function verifyFixtureArchive(path: string, expected: string): Promise<string | null> {
  const actual = await hashFixtureFile(path);
  return actual === expected ? null : actual;
}

export function writeFixtureTreeStamp(treeDirectory: string, stamp: Readonly<FixtureTreeStamp>): void {
  mkdirSync(treeDirectory, { recursive: true });
  const packs = [...stamp.packs].sort((a, b) => a.pack.localeCompare(b.pack));
  writeFileSync(join(treeDirectory, FIXTURE_STAMP_FILE), `${JSON.stringify({ ...stamp, packs }, null, 2)}\n`, 'utf8');
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`GET ${url} → HTTP ${response.status} ${response.statusText}`);
  return response.text();
}

// Downloads beside the final path and renames only after the hash agrees, so an interrupted or
// truncated transfer can never occupy a content-addressed slot and be trusted by the next run.
async function downloadFixtureArchive(entry: Readonly<FixturePackEntry>, destination: string): Promise<void> {
  mkdirSync(dirname(destination), { recursive: true });
  const partial = `${destination}.part`;
  const url = getFixturePackUrl(entry);
  const response = await fetch(url);
  if (!response.ok || response.body === null) {
    throw new Error(`GET ${url} → HTTP ${response.status} ${response.statusText}`);
  }
  await pipeline(Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]), createWriteStream(partial));

  const actual = await verifyFixtureArchive(partial, entry.sha256);
  if (actual !== null) {
    rmSync(partial, { force: true });
    throw new Error(
      `${entry.pack} [${entry.variant}] failed sha256 verification on download\n  expected ${entry.sha256}\n  actual   ${actual}`,
    );
  }
  renameSync(partial, destination);
}

async function main(): Promise<void> {
  const { list, packs, variant } = parseArguments(process.argv.slice(2));

  const manifestUrl = `${FIXTURE_RELEASE_BASE_URL}/${FIXTURE_RELEASE_TAG}/index.json`;
  const manifest = parseFixtureManifest(await fetchText(manifestUrl));
  if (manifest === null) throw new Error(`${manifestUrl} is not a well-formed fixture manifest`);

  const tagProblems = crossCheckFixtureTag(manifest, FIXTURE_RELEASE_TAG);
  if (tagProblems.length > 0) {
    throw new Error(
      `the release tag disagrees with itself across its three recorded places:\n  ${tagProblems.join('\n  ')}`,
    );
  }

  const checksums = parseFixtureChecksums(
    await fetchText(`${FIXTURE_RELEASE_BASE_URL}/${FIXTURE_RELEASE_TAG}/SHA256SUMS`),
  );
  if (checksums === null) throw new Error('SHA256SUMS is not a well-formed checksum listing');
  const disagreements = crossCheckFixtureChecksums(manifest, checksums);
  if (disagreements.length > 0) {
    throw new Error(
      `index.json and SHA256SUMS publish different hashes for the same release — the release moved under the pinned tag:\n  ${disagreements.join('\n  ')}`,
    );
  }
  console.log(`Manifest ${FIXTURE_RELEASE_TAG}: ${manifest.packs.length} entries, both published hash copies agree.`);

  if (list) {
    for (const pack of [...new Set(manifest.packs.map((entry) => entry.pack))].sort()) {
      console.log(
        `  ${pack} — variants ${[...new Set(manifest.packs.filter((entry) => entry.pack === pack).map((entry) => entry.variant))].sort().join(', ')}`,
      );
    }
    return;
  }

  const plan = planFixtureFetch(manifest, packs, variant);
  console.log(formatFixturePlan(plan));
  if (plan.errors.length > 0) process.exit(1);

  await realizeFixturePlan(plan);
}

function parseArguments(argv: readonly string[]): { list: boolean; packs: readonly string[]; variant: string } {
  const packs: string[] = [];
  let list = false;
  // `full` is the default by ruling, and `--variant` is an escape hatch rather than a policy surface.
  let variant = 'full';
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (argument === '--list') list = true;
    else if (argument === '--variant') variant = argv[++index] ?? '';
    else if (argument.startsWith('--variant=')) variant = argument.slice('--variant='.length);
    else if (argument.startsWith('-')) throw new Error(`unknown option ${argument}`);
    else packs.push(argument);
  }
  return { list, packs, variant };
}

// Fetch, verify, and unpack the plan. Extraction is per pack and on demand — the full corpus is 26,461
// files and unpacking it speculatively is the file-descriptor hazard `FLIGHT_FIXTURES_DIR` exists for.
async function realizeFixturePlan(plan: Readonly<FixturePlan>): Promise<void> {
  const cacheDirectory = resolveFixtureCacheDirectory();
  console.log(`Cache: ${cacheDirectory}`);

  for (const planned of plan.entries) {
    const { entry } = planned;
    const archivePath = getFixtureArchivePath(cacheDirectory, entry.sha256);

    if (existsSync(archivePath)) {
      const actual = await verifyFixtureArchive(archivePath, entry.sha256);
      if (actual !== null) {
        throw new Error(
          `${entry.pack} [${entry.variant}] failed sha256 verification — the cached copy at ${archivePath} does not match the manifest\n  expected ${entry.sha256}\n  actual   ${actual}`,
        );
      }
      console.log(`  ✔ ${entry.pack} cached and verified`);
    } else {
      console.log(`  ↓ ${entry.pack} ${getFixturePackUrl(entry)}`);
      await downloadFixtureArchive(entry, archivePath);
      console.log(`  ✔ ${entry.pack} downloaded and verified`);
    }

    const treeDirectory = getFixtureTreePath(cacheDirectory, entry.variant, planned.tree);
    const stamp = readFixtureTreeStamp(treeDirectory);
    if (stamp?.packs.some((recorded) => recorded.pack === entry.pack && recorded.sha256 === entry.sha256) === true) {
      console.log(`  ✔ ${entry.pack} already extracted → ${treeDirectory}`);
      continue;
    }
    extractFixturePack(archivePath, treeDirectory);
    writeFixtureTreeStamp(treeDirectory, {
      packs: [
        ...(stamp?.packs ?? []).filter((recorded) => recorded.pack !== entry.pack),
        { file: entry.file, files: entry.files, pack: entry.pack, sha256: entry.sha256 },
      ],
      tag: FIXTURE_RELEASE_TAG,
      variant: entry.variant,
    });
    console.log(`  ✔ ${entry.pack} extracted → ${treeDirectory}`);
  }

  const trees = [
    ...new Set(plan.entries.map((planned) => getFixtureTreePath(cacheDirectory, plan.variant, planned.tree))),
  ];
  console.log(`Ready — ${plan.entries.length} pack(s) in ${trees.length} tree(s):`);
  for (const tree of trees.sort()) console.log(`  ${tree}`);
}

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = resolve(dirname(scriptPath), '..');

if (resolve(process.argv[1] ?? '') === resolve(scriptPath)) {
  main().catch((error: unknown) => {
    console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
