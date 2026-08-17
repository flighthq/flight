// The transport half of the consumer lock: proves that the bytes CI downloaded are the exact bytes Flight
// pinned, before any of them are decoded or compared (agents/render-oracle-repository.md §5, §9).
//
// ★ EVERY LINK IS CHECKED, AND THE ORDER IS THE POINT. Lock → release manifest → pack asset → image.
// Each step verifies the NEXT step's expected hash against something already trusted, so there is no
// point at which an attacker-or-accident-substituted file is read as authoritative. Verifying the pack
// against the manifest and the manifest against nothing would be theatre: the manifest is exactly the
// file a substitution would also replace, which is why `manifestSha256` lives in the lock, in this repo,
// under review.
//
// ★ A TRANSPORT FAULT MUST NEVER SURFACE AS A RENDER REGRESSION. Every failure here is named for what
// broke in the supply chain. The alternative — letting a truncated download reach a pixel comparison —
// reports "the WebGL renderer changed" to someone who will then go and read a shader, which is the most
// expensive wrong answer this system can give.
//
// ★ THIS MODULE FETCHES NOTHING. It is handed bytes and returns verdicts, so the whole chain is decidable
// in a unit test with no network. The CLI owns the downloads.
import { createHash } from 'node:crypto';

import type { OracleLock } from './oracle-records';

export interface OracleReleasePack {
  id: string;
  file: string;
  sha256: string;
  size: number;
  imageCount: number;
}

export interface OraclePackProblem {
  kind: OraclePackProblemKind;
  detail: string;
}

export type OraclePackProblemKind =
  /** Downloaded bytes did not hash to what the trusted record said they would. */
  | 'checksum'
  | 'not-json'
  | 'field-missing'
  /** The release exists and is internally sound, but does not carry a pack the lock pins. */
  | 'pack-absent'
  /** Lock and release manifest disagree about a pack's bytes — one of them is stale. */
  | 'pack-mismatch'
  /** The release manifest is for a different tag than the lock pins. */
  | 'tag-mismatch';

/** The URL a release asset is fetched from. One definition, so the CLI and any workflow cannot drift. */
export function getOracleAssetUrl(lock: Readonly<OracleLock>, file: string): string {
  return `https://github.com/${lock.repository}/releases/download/${lock.releaseTag}/${file}`;
}

/**
 * Verifies downloaded release-manifest bytes against the lock, and the lock's packs against that manifest.
 *
 * Returns the packs the lock pins, in lock order, with the release's metadata attached — or every problem
 * found. Both directions are checked: a pack in the lock but absent from the release, and a pack both
 * name with different bytes. The second is the one that matters most, because it is what a re-cut release
 * under a reused tag looks like from here.
 */
export function verifyOracleRelease(
  manifestBytes: Readonly<Uint8Array>,
  lock: Readonly<OracleLock>,
): { packs: OracleReleasePack[] } | { problems: OraclePackProblem[] } {
  const actual = createHash('sha256').update(manifestBytes).digest('hex');
  if (actual !== lock.manifestSha256) {
    return {
      problems: [
        {
          detail: `release manifest hashes ${actual}, lock pins ${lock.manifestSha256}`,
          kind: 'checksum',
        },
      ],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(manifestBytes).toString('utf8'));
  } catch (error) {
    return { problems: [{ detail: `release manifest did not parse: ${String(error)}`, kind: 'not-json' }] };
  }

  const record = parsed as { packs?: unknown; releaseTag?: unknown };
  if (!Array.isArray(record.packs)) {
    return { problems: [{ detail: 'release manifest has no packs array', kind: 'field-missing' }] };
  }
  const problems: OraclePackProblem[] = [];
  // A tag mismatch is reported and does not stop the pack checks: naming only the first fault makes a
  // stale lock take several CI runs to diagnose, one problem at a time.
  if (record.releaseTag !== lock.releaseTag) {
    problems.push({
      detail: `release manifest is for ${String(record.releaseTag)}, lock pins ${lock.releaseTag}`,
      kind: 'tag-mismatch',
    });
  }

  const byId = new Map<string, OracleReleasePack>();
  for (const entry of record.packs) {
    const pack = entry as Partial<OracleReleasePack>;
    if (typeof pack.id !== 'string' || typeof pack.file !== 'string' || typeof pack.sha256 !== 'string') {
      problems.push({ detail: 'release manifest pack is missing id/file/sha256', kind: 'field-missing' });
      continue;
    }
    byId.set(pack.id, {
      file: pack.file,
      id: pack.id,
      imageCount: typeof pack.imageCount === 'number' ? pack.imageCount : 0,
      sha256: pack.sha256,
      size: typeof pack.size === 'number' ? pack.size : 0,
    });
  }

  const packs: OracleReleasePack[] = [];
  for (const [id, pinned] of Object.entries(lock.packs)) {
    const published = byId.get(id);
    if (published === undefined) {
      problems.push({ detail: `lock pins pack ${id}, release does not publish it`, kind: 'pack-absent' });
      continue;
    }
    if (
      published.sha256 !== pinned.sha256 ||
      published.file !== pinned.file ||
      published.imageCount !== Object.keys(pinned.images).length
    ) {
      problems.push({
        detail: `pack ${id}: lock pins ${pinned.file}@${pinned.sha256} with ${Object.keys(pinned.images).length} image(s), release publishes ${published.file}@${published.sha256} with ${published.imageCount}`,
        kind: 'pack-mismatch',
      });
      continue;
    }
    packs.push(published);
  }

  return problems.length > 0 ? { problems } : { packs };
}

/**
 * Verifies downloaded pack bytes against the hash the lock pins. Returns the problem, or `null` for sound.
 *
 * Deliberately takes the expected hash from the LOCK rather than the release manifest, even though
 * `verifyOracleRelease` has already proved the two agree. The lock is the record under review in this
 * repository; keeping it as the authority means the check still holds if that agreement is ever relaxed.
 */
export function verifyOraclePackBytes(
  bytes: Readonly<Uint8Array>,
  pinned: Readonly<{ file: string; sha256: string }>,
): OraclePackProblem | null {
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual === pinned.sha256) return null;
  return {
    detail: `pack ${pinned.file} hashes ${actual}, lock pins ${pinned.sha256}`,
    kind: 'checksum',
  };
}
