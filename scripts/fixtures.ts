// `npm run fixtures <pack> [<pack>...]` — fetch conformance fixture packs into a local, gitignored
// cache, verified against the manifest's sha256 on every run, and unpack the ones asked for. `--all`
// explicitly asks for every pack in one release variant; no test/build hook ever does so implicitly.
// The decision logic lives in `fixtures-core.ts`; this file is the filesystem, the network, and the CLI.
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
// happen is a later step copying, vendoring, or concatenating any of it INTO the repository — that one
// action is what turns using a fetched tree into taking from it. Read the corpus in place; copy nothing
// out.
//
// That metadata is also why a pack's `files` count is not its archive entry count: `files` counts the
// FIXTURES. `swf-ruffle-fixtures` unpacks 16,650 entries against a recorded 16,639, and `atf-fixtures`
// 17 against 14 — in both the difference is exactly that pack's metadata entries. THE COUNT VARIES PER
// PACK (11 and 3 here, since only some packs carry a `LICENSES/` directory), so a completeness check
// built on `files` versus a recursive count of the tree cannot subtract a constant; it has to exclude
// the metadata by name or it reports a phantom shortfall on every pack.
//
// ★ AND EXCLUDING THEM BY NAME IS THE ONLY THING ANY LATER PHASE EVER DOES WITH THOSE FILES. The two
// facts belong together because the count delta is what sends a reader looking at them in the first
// place. NO COMMITTED ARTIFACT MAY BE DERIVED FROM THEM AT ALL — not a copy, not a concatenation, not a
// summary, AND NOT A COUNT BROKEN DOWN BY TERMS, which records what they say by arithmetic. A table
// reading "N packs under X, M under Y" quotes nothing and still states whose terms the corpus carries;
// it launders the prohibited thing through counting, and a scoreboard is exactly the artifact that
// grows such a column because it looks informative. Count fixtures, never their provenance.
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
export const FIXTURE_RELEASE_TAG = '0.1.1';

export const FIXTURE_RELEASE_BASE_URL = 'https://github.com/flighthq/flight-oracles/releases/download';

// Written into every extraction tree. A tree that cannot say which tag and which variant produced it is
// a tree two runs can disagree about without either being able to tell.
export interface FixtureTreeStamp {
  packs: readonly FixtureTreeStampPack[];
  tag: string;
  variant: string;
}

// `verifiedFixtureFiles` is named for how it was obtained, not for what it counts. The field it replaced
// was `files`, copied straight from the manifest — a number the stamp asserted and nothing had checked.
// A name that states its provenance is what lets a reader tell a verified stamp from a copied one without
// knowing which version of this script wrote it.
export interface FixtureTreeStampPack {
  file: string;
  // The pack's own metadata entries, counted separately rather than folded in, so the fixture total never
  // silently absorbs them.
  metadataFiles: number;
  pack: string;
  sha256: string;
  verifiedFixtureFiles: number;
}

// What an extracted pack actually put on disk, measured rather than assumed. Declared here rather than in
// `@flighthq/types` because `scripts/` is outside the package graph — a build-script type does not belong
// in the SDK's exported surface.
export interface FixtureExtractionVerification {
  // Fixture entries the archive actually contains, excluding the pack's own metadata.
  archiveFixtureEntries: number;
  // What the release manifest says the pack holds. Disagreeing with `archiveFixtureEntries` means the
  // publication is inconsistent with itself; disagreeing with `presentFixtureFiles` means the local
  // extraction is incomplete. Different causes and different remedies, so they stay separate fields.
  declaredFixtureFiles: number;
  metadataEntries: readonly string[];
  missingSample: readonly string[];
  presentFixtureFiles: number;
}

export interface FixtureArguments {
  all: boolean;
  list: boolean;
  packs: readonly string[];
  variant: string;
}

export const FIXTURE_STAMP_FILE = '.flight-fixtures.json';

// Unpack one verified pack into its tree. Extraction is delegated to `tar` rather than reimplemented:
// these are third-party archives that may carry long paths through extended headers, and a
// hand-rolled reader that mishandles one silently drops files from a conformance corpus.
export function extractFixturePack(archivePath: string, treeDirectory: string): void {
  mkdirSync(treeDirectory, { recursive: true });
  execFileSync('tar', ['-xzf', archivePath, '-C', treeDirectory], { stdio: 'pipe' });
}

// A pack root carries its own metadata beside the corpus. These are EXCLUDED BY NAME from the fixture
// count rather than absorbed into a tolerance — a tolerance would re-hide exactly what the count exists
// to surface, since "11 fewer than expected" is indistinguishable from a truncated extraction once it is
// inside a slack band. Named here, so a pack that grows a new metadata file fails loudly and gets a
// deliberate decision rather than silently widening the band.
export const FIXTURE_PACK_METADATA_ROOT_FILES: readonly string[] = ['NOTICE.md', 'README.md', 'manifest.json'];
export const FIXTURE_PACK_METADATA_DIRECTORY = 'LICENSES/';

// Metadata a pack carries BESIDE EACH ITEM rather than once at its root, matched by exact basename at
// any depth. A corpus of third-party models commonly files one of these inside every model directory.
//
// ★ THIS IS A NAMED EXCLUSION, NOT A DEPTH TOLERANCE, AND THE DISTINCTION IS THE WHOLE POINT. Excluding
// "any .md below the root" would re-hide what the count exists to surface: a pack that grew a stray
// note, or lost real fixtures and gained files, would still balance. Only this exact filename is
// exempt, so anything else new still fails loudly and gets a deliberate decision — the same rule the
// root list above is written to.
export const FIXTURE_PACK_METADATA_NESTED_FILES: readonly string[] = ['LICENSE.md'];

// True for a pack's own metadata rather than a fixture. Paths come from `tar -t`, which may or may not
// carry a `./` prefix depending on how the archive was created, so it is normalized off first.
//
// ★ A NESTED ENTRY COUNTED AS A FIXTURE FAILS THE VERIFICATION AND BLAMES THE WRONG PARTY. The count
// mismatch is reported as "the manifest disagrees with its own archive", which reads as a publication
// fault — but a publisher that correctly omits per-item metadata from its file count is right, and the
// reader that counts it is wrong. The error message cannot tell those apart, so the classifier has to.
export function isFixturePackMetadataEntry(path: string): boolean {
  const normalized = path.startsWith('./') ? path.slice(2) : path;
  if (normalized.startsWith(FIXTURE_PACK_METADATA_DIRECTORY)) return true;
  if (FIXTURE_PACK_METADATA_ROOT_FILES.includes(normalized)) return true;
  const basename = normalized.slice(normalized.lastIndexOf('/') + 1);
  return normalized.includes('/') && FIXTURE_PACK_METADATA_NESTED_FILES.includes(basename);
}

// WHAT ACTUALLY LANDED, COMPARED AGAINST WHAT THE MANIFEST SAID WOULD.
//
// The fetcher used to print a success tick after `tar` returned and copy the manifest's `files` count
// straight into the stamp — so THE RECORD STATED A COUNT NOTHING HAD CHECKED. The number needed to check
// it was already in hand and unused. This closes that: the archive's own listing is partitioned into
// fixtures and metadata, the fixture count is compared against the manifest, and every fixture entry is
// confirmed present on disk.
//
// Two distinct failures are separated because their remedies differ: a manifest that disagrees with its
// own archive is a publication problem, while entries missing from disk after a successful `tar` is a
// local write problem — file-descriptor exhaustion on a sandbox mount is the case this repository has
// already hit, and it is why `FLIGHT_FIXTURES_DIR` exists.
export function verifyFixtureExtraction(
  archivePath: string,
  treeDirectory: string,
  declaredFixtureFiles: number,
): FixtureExtractionVerification {
  // The `./` prefix is present or absent depending only on how the archive was created, so it is
  // normalized off once here. Otherwise a reported missing path would carry provenance noise, and two
  // archives of identical content would produce differently-spelled failure messages.
  const listing = execFileSync('tar', ['-tzf', archivePath], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
    .split('\n')
    .filter((line) => line !== '' && !line.endsWith('/'))
    .map((line) => (line.startsWith('./') ? line.slice(2) : line));

  const metadata: string[] = [];
  const fixtures: string[] = [];
  for (const path of listing) (isFixturePackMetadataEntry(path) ? metadata : fixtures).push(path);

  // Only the first few absences are kept: a wholly failed extraction would otherwise build a
  // 16,000-entry array to say one thing, and the count already carries the magnitude.
  const missing: string[] = [];
  let presentFixtureFiles = 0;
  for (const path of fixtures) {
    if (existsSync(join(treeDirectory, path))) presentFixtureFiles += 1;
    else if (missing.length < 10) missing.push(path);
  }

  return {
    archiveFixtureEntries: fixtures.length,
    declaredFixtureFiles,
    metadataEntries: metadata.sort(),
    missingSample: missing,
    presentFixtureFiles,
  };
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
    // ★ EVERY PACK IS CHECKED, NOT JUST THE ARRAY. A stamp written by an older build carries the fields
    // that build had, and this file is READ FROM DISK — so no compiler can reach the site that wrote it.
    // Returning it unchecked hands back an object whose declared type promises numbers the runtime does
    // not have, and a consumer reading `undefined` as a count produces a plan rather than an error. A
    // stamp this reader cannot vouch for is treated as NO stamp, which is the sentinel this function
    // already uses and makes the caller re-fetch and re-verify rather than proceed on a silent gap.
    if (!packs.every(isFixtureTreeStampPack)) return null;
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
  const { all, list, packs, variant } = parseFixtureArguments(process.argv.slice(2));

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

  const requested = all ? [...new Set(manifest.packs.map((entry) => entry.pack))].sort() : packs;
  const plan = planFixtureFetch(manifest, requested, variant);
  console.log(formatFixturePlan(plan));
  if (plan.errors.length > 0) process.exit(1);

  await realizeFixturePlan(plan);
}

export function parseFixtureArguments(argv: readonly string[]): FixtureArguments {
  const packs: string[] = [];
  let all = false;
  let list = false;
  // `full` is the default by ruling, and `--variant` is an escape hatch rather than a policy surface.
  let variant = 'full';
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (argument === '--all') all = true;
    else if (argument === '--list') list = true;
    else if (argument === '--variant') variant = argv[++index] ?? '';
    else if (argument.startsWith('--variant=')) variant = argument.slice('--variant='.length);
    else if (argument.startsWith('-')) throw new Error(`unknown option ${argument}`);
    else packs.push(argument);
  }
  if (variant.length === 0) throw new Error('--variant requires a non-empty value');
  if (all && packs.length > 0) throw new Error('--all cannot be combined with named packs');
  if (list && (all || packs.length > 0)) throw new Error('--list cannot be combined with --all or named packs');
  return { all, list, packs, variant };
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

    // The success line used to print here, straight after `tar` returned. Nothing looked at what landed,
    // and the manifest's own count — the number that could have checked it — was copied into the stamp
    // unread. Both failures below are hard, and they are separate because their remedies are: a manifest
    // that disagrees with its own archive is a publication problem, while entries missing after a
    // successful extraction is a local write problem.
    const verified = verifyFixtureExtraction(archivePath, treeDirectory, entry.files);
    if (verified.archiveFixtureEntries !== verified.declaredFixtureFiles) {
      throw new Error(
        `${entry.pack} [${entry.variant}] manifest disagrees with its own archive\n  manifest states ${verified.declaredFixtureFiles} fixture files\n  archive contains ${verified.archiveFixtureEntries} (plus ${verified.metadataEntries.length} pack-metadata entries: ${verified.metadataEntries.join(', ')})`,
      );
    }
    if (verified.presentFixtureFiles !== verified.archiveFixtureEntries) {
      throw new Error(
        `${entry.pack} [${entry.variant}] extraction is incomplete — ${verified.archiveFixtureEntries - verified.presentFixtureFiles} of ${verified.archiveFixtureEntries} fixture files are absent from ${treeDirectory}\n  first missing: ${verified.missingSample.join(', ')}\n  a partial write on a constrained mount is the known cause; FLIGHT_FIXTURES_DIR moves the pool off it`,
      );
    }

    writeFixtureTreeStamp(treeDirectory, {
      packs: [
        ...(stamp?.packs ?? []).filter((recorded) => recorded.pack !== entry.pack),
        {
          file: entry.file,
          metadataFiles: verified.metadataEntries.length,
          pack: entry.pack,
          sha256: entry.sha256,
          verifiedFixtureFiles: verified.presentFixtureFiles,
        },
      ],
      tag: FIXTURE_RELEASE_TAG,
      variant: entry.variant,
    });
    console.log(
      `  ✔ ${entry.pack} extracted and verified — ${verified.presentFixtureFiles} fixture files present, ${verified.metadataEntries.length} pack-metadata entries → ${treeDirectory}`,
    );
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

// Whether a parsed pack entry actually carries what `FixtureTreeStampPack` declares. A runtime check
// rather than a cast because the value came from a file: a cast ASSERTS a shape, only a check
// ESTABLISHES one.
function isFixtureTreeStampPack(value: unknown): value is FixtureTreeStampPack {
  if (typeof value !== 'object' || value === null) return false;
  const pack = value as Partial<FixtureTreeStampPack>;
  return (
    typeof pack.file === 'string' &&
    typeof pack.metadataFiles === 'number' &&
    typeof pack.pack === 'string' &&
    typeof pack.sha256 === 'string' &&
    typeof pack.verifiedFixtureFiles === 'number'
  );
}
