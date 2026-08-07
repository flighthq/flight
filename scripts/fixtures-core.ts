// The pure half of the conformance fixture fetcher: everything that decides WHAT to fetch, with no
// filesystem, no network, and no clock. `fixtures.ts` holds the I/O and the CLI. The split exists so
// the rules below — variant resolution, merge-group expansion, the two-copy hash cross-check, the
// three-place tag cross-check — are pinned by tests that cannot reach the network, which is the one
// hard constraint on this phase's test suite.
//
// The manifest is the design surface. It is an object, `{ version, packs: [...] }`, NOT a bare array;
// each entry is `{ pack, variant, file, sha256, size, files, mergeGroup? }` with `mergeGroup` present
// only on packs that share an extraction tree.
//
// THE ROOT OF TRUST IS `index.json`, AND THE CHOICE IS DELIBERATE. The release publishes the same 80
// hashes twice — once inside `index.json`, once in `SHA256SUMS` — and publishes no hash of either
// file, so nothing verifies the manifest itself; the pinned tag plus TLS is the entire guarantee.
// `index.json` wins because it is what the per-pack path already reads: choosing the other copy would
// mean verifying against a file no other step consults. `SHA256SUMS` is still fetched and cross-checked
// entry by entry, and a DISAGREEMENT BETWEEN THE TWO COPIES IS ITS OWN HARD FAILURE rather than a
// tie-break — two independent copies of one fact can only diverge if the release moved underneath the
// pin, which is precisely the irreproducibility the pin exists to prevent.

export interface FixtureManifest {
  packs: readonly FixturePackEntry[];
  version: string;
}

export interface FixturePackEntry {
  file: string;
  files: number;
  mergeGroup?: string;
  pack: string;
  sha256: string;
  size: number;
  variant: string;
}

export interface FixturePlan {
  entries: readonly FixturePlanEntry[];
  errors: readonly string[];
  totalBytes: number;
  totalFiles: number;
  variant: string;
}

export interface FixturePlanEntry {
  entry: FixturePackEntry;
  // False when the pack was pulled in by merge-group expansion rather than named on the command line.
  // The formatter prints the distinction because the added weight can dwarf the request: asking for
  // `gltf-khronos-fixtures` adds `gltf-khronos-textures`, which alone is 472 MB.
  requested: boolean;
  // The directory a pack unpacks into. Merge-group members share one tree by design, so the group name
  // is the tree name whenever there is a group and the pack name is the tree name otherwise.
  tree: string;
}

// Both published copies of the hash set, compared entry by entry in both directions. Returns the
// disagreements as messages; empty means the two copies agree exactly. A non-empty result is a hard
// failure at the call site, never a tie-break — see the header.
export function crossCheckFixtureChecksums(
  manifest: Readonly<FixtureManifest>,
  checksums: ReadonlyMap<string, string>,
): readonly string[] {
  const problems: string[] = [];
  for (const entry of manifest.packs) {
    const published = checksums.get(entry.file);
    if (published === undefined) {
      problems.push(`${entry.file} is in index.json but absent from SHA256SUMS`);
    } else if (published !== entry.sha256) {
      problems.push(`${entry.file} hashes disagree — index.json ${entry.sha256}, SHA256SUMS ${published}`);
    }
  }
  const known = new Set(manifest.packs.map((entry) => entry.file));
  for (const file of checksums.keys()) {
    if (!known.has(file)) problems.push(`${file} is in SHA256SUMS but absent from index.json`);
  }
  return problems.sort();
}

// The pinned tag appears in three independent places — the download URL, the manifest's own `version`,
// and the tag embedded in every asset filename. Trusting one of the three would let a manifest served
// from the wrong tag pass unnoticed, so all three are compared against the tag the code pinned.
export function crossCheckFixtureTag(manifest: Readonly<FixtureManifest>, tag: string): readonly string[] {
  const problems: string[] = [];
  if (manifest.version !== tag) {
    problems.push(`index.json declares version ${manifest.version}, but the pinned release tag is ${tag}`);
  }
  for (const entry of manifest.packs) {
    if (!entry.file.includes(tag)) problems.push(`${entry.file} does not carry the pinned tag ${tag} in its filename`);
  }
  return problems.sort();
}

// The human-readable plan, printed before a single byte is fetched. Merge-group expansion is stated
// here rather than left to a comment: silence about an added 472 MB pack is the failure mode, and a
// user who asked for one member has to see both what was added and why the tree needs it.
export function formatFixturePlan(plan: Readonly<FixturePlan>): string {
  if (plan.errors.length > 0) return plan.errors.map((error) => `✗ ${error}`).join('\n');

  const lines: string[] = [];
  lines.push(
    `Plan — variant ${plan.variant}, ${plan.entries.length} pack(s), ${formatByteSize(plan.totalBytes)}, ${plan.totalFiles.toLocaleString('en-US')} files`,
  );
  for (const planned of plan.entries) {
    const origin = planned.requested ? '' : ` (added: shares the ${planned.tree} tree with a requested pack)`;
    lines.push(
      `  ${planned.entry.pack} [${planned.entry.variant}] → ${planned.tree}/  ${formatByteSize(planned.entry.size)}, ${planned.entry.files.toLocaleString('en-US')} files${origin}`,
    );
  }
  const added = plan.entries.filter((planned) => !planned.requested);
  if (added.length > 0) {
    lines.push(
      `  Merge groups extract into a shared tree, so a group is fetched whole: a lone member yields a tree that looks complete and is not. Added ${added.length} pack(s), ${formatByteSize(added.reduce((total, planned) => total + planned.entry.size, 0))}.`,
    );
  }
  return lines.join('\n');
}

// Which variants a pack actually publishes. Not every pack has all three, so this is what a
// missing-variant failure reports instead of falling back to another build.
export function listFixturePackVariants(manifest: Readonly<FixtureManifest>, pack: string): readonly string[] {
  return [...new Set(manifest.packs.filter((entry) => entry.pack === pack).map((entry) => entry.variant))].sort();
}

// `SHA256SUMS` is the conventional `<sha256>␣␣<filename>` listing, one line per tarball. A single
// unparsable line is a malformed publication rather than a line to skip, so it yields the null sentinel
// for the whole file — a partially-read hash listing would silently verify fewer packs than it appears to.
export function parseFixtureChecksums(text: string): ReadonlyMap<string, string> | null {
  const checksums = new Map<string, string>();
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    const match = /^([0-9a-f]{64}) [ *](.+)$/.exec(line);
    if (match === null) return null;
    checksums.set(match[2]!.trim(), match[1]!);
  }
  return checksums.size === 0 ? null : checksums;
}

// Parses and shape-validates `index.json`. Returns the null sentinel for anything that is not a
// well-formed manifest, including the shape a naive reader would assume: a bare array of entries.
export function parseFixtureManifest(text: string): FixtureManifest | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const { packs, version } = parsed;
  if (typeof version !== 'string' || version === '' || !Array.isArray(packs) || packs.length === 0) return null;

  const entries: FixturePackEntry[] = [];
  for (const candidate of packs) {
    if (!isRecord(candidate)) return null;
    const { file, files, mergeGroup, pack, sha256, size, variant } = candidate;
    if (typeof file !== 'string' || typeof pack !== 'string' || typeof variant !== 'string') return null;
    if (typeof files !== 'number' || typeof size !== 'number') return null;
    if (typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(sha256)) return null;
    if (mergeGroup !== undefined && typeof mergeGroup !== 'string') return null;
    entries.push(
      mergeGroup === undefined
        ? { file, files, pack, sha256, size, variant }
        : { file, files, mergeGroup, pack, sha256, size, variant },
    );
  }
  return { packs: entries, version };
}

// Turns a request into the exact set of packs to fetch, or into errors that name what went wrong.
//
// TWO RULES LIVE HERE. A pack that does not publish the asked-for variant is an ERROR NAMING THE
// VARIANTS IT DOES publish — never a silent fall back to another build, which would make two runs
// quietly incomparable. And a named merge-group member expands to its whole group, because members
// unpack into one shared tree and a partial tree is indistinguishable from a complete one at the
// filesystem level; `formatFixturePlan` states the expansion and its cost before anything is fetched.
export function planFixtureFetch(
  manifest: Readonly<FixtureManifest>,
  requested: readonly string[],
  variant: string,
): FixturePlan {
  const errors: string[] = [];
  const known = new Set(manifest.packs.map((entry) => entry.pack));
  if (requested.length === 0) errors.push('no pack named — pass one or more of the packs listed by --list');

  const wanted = new Map<string, boolean>();
  for (const pack of requested) {
    if (!known.has(pack)) {
      errors.push(`unknown pack ${pack} — the release publishes ${known.size} packs; run with --list to see them`);
      continue;
    }
    const group = findFixtureMergeGroup(manifest, pack);
    if (group === null) {
      wanted.set(pack, true);
      continue;
    }
    for (const member of group) wanted.set(member, wanted.get(member) === true || member === pack);
  }

  const entries: FixturePlanEntry[] = [];
  for (const [pack, isRequested] of wanted) {
    const entry = manifest.packs.find((candidate) => candidate.pack === pack && candidate.variant === variant);
    if (entry === undefined) {
      const available = listFixturePackVariants(manifest, pack);
      const how = isRequested ? '' : ' (pulled in by merge-group expansion)';
      errors.push(`${pack} publishes no ${variant} variant${how} — it publishes ${available.join(', ')}`);
      continue;
    }
    entries.push({ entry, requested: isRequested, tree: entry.mergeGroup ?? entry.pack });
  }

  entries.sort((a, b) => a.entry.pack.localeCompare(b.entry.pack));
  return {
    entries: errors.length > 0 ? [] : entries,
    errors: errors.sort(),
    totalBytes: entries.reduce((total, planned) => total + planned.entry.size, 0),
    totalFiles: entries.reduce((total, planned) => total + planned.entry.files, 0),
    variant,
  };
}

function findFixtureMergeGroup(manifest: Readonly<FixtureManifest>, pack: string): readonly string[] | null {
  const group = manifest.packs.find((entry) => entry.pack === pack)?.mergeGroup;
  if (group === undefined) return null;
  return [...new Set(manifest.packs.filter((entry) => entry.mergeGroup === group).map((entry) => entry.pack))].sort();
}

function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
