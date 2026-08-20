// Verifies a fresh capture against the blessed reference images Flight has pinned
// (agents/render-reference-image-repository.md §6 and §9). This is the consumer half: the producer commissions and
// blesses, this decides whether today's render still matches what was blessed.
//
// ★ THE CHAIN IS VERIFIED LINK BY LINK, AND EACH LINK FAILS BY NAME (§9, "the consumer lock is
// internally consistent"). Pack bytes against the lock; each image's encoded bytes against the pack
// manifest; only then is anything decoded. A pack that arrived corrupted must not reach a pixel
// comparison and be reported as a render regression — that names the wrong cause, in the wrong
// repository, to someone who will go and look at a shader.
//
// ★ IT COMPARES `sha256(decoded RGBA)`, NOT FLIGHT'S CAPTURE HASH. `captureScreenshotHash` prepends
// `"<width>x<height>:"` and hashes pixels the browser decoded, which may carry colour conversion or alpha
// premultiplication. `flight-reference-images` hashes the straight decoded bytes. The two are both correct and not
// comparable, so this decodes the fresh PNG itself with `reference-image-png` and hashes it their way. That
// decoder was validated against their independent implementation on the first blessed pack.
//
// ★ EXACT COMPARISON IS SUFFICIENT ONLY WHILE THE POLICY SAYS SO. The registered policy
// `pixel-exact-swiftshader-pw-1-61-v1` is channelTolerance 0 / maximumMismatchFraction 0, so equality of
// the decoded hash IS the comparison. The moment a fuzzy policy is registered this must decode BOTH
// images and go through `compareOracleReference`; the seam for that is `comparePixels` below, and the
// policy is read rather than assumed so a mismatch is caught instead of silently under-checking.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { decodeOraclePng } from './reference-image-png';
import type { ReferenceImageLockImage } from './reference-image-records';
import type { ReferenceImageCellInput } from './reference-image-state';
import {
  compareReferenceImage,
  resolveReferenceImageTolerance,
  type ReferenceImageToleranceCatalog,
} from './reference-image-tolerance';

export interface PackManifestImage {
  path: string;
  artifactSha256: string;
  pixelSha256: string;
  width: number;
  height: number;
}

export interface VerifyProblem {
  identity: string;
  kind:
    | 'pack-image-missing'
    | 'pack-image-corrupt'
    | 'pack-image-undecodable'
    | 'capture-missing'
    | 'capture-undecodable'
    | 'comparison-unavailable'
    | 'dimensions';
  detail: string;
}

export interface VerifyResult {
  cells: readonly ReferenceImageCellInput[];
  problems: readonly VerifyProblem[];
}

export interface ReferenceImageLockImageProblem {
  identity: string;
  kind: 'lock-image-missing' | 'lock-image-mismatch' | 'lock-image-unlisted';
  detail: string;
}

/** Proves the committed per-image identities describe exactly the already verified pack manifest. */
export function verifyOracleLockImages(
  lockedImages: Readonly<Record<string, Readonly<ReferenceImageLockImage>>>,
  manifestImages: readonly Readonly<PackManifestImage>[],
): ReferenceImageLockImageProblem[] {
  const problems: ReferenceImageLockImageProblem[] = [];
  const published = new Map(manifestImages.map((image) => [packManifestImageIdentity(image.path), image]));
  for (const [identity, locked] of Object.entries(lockedImages)) {
    const image = published.get(identity);
    if (image === undefined) {
      problems.push({
        detail: 'the lock names this image but the pack manifest does not',
        identity,
        kind: 'lock-image-missing',
      });
    } else if (image.pixelSha256 !== locked.pixelSha256) {
      problems.push({
        detail: `lock pins ${locked.pixelSha256}, pack manifest publishes ${image.pixelSha256}`,
        identity,
        kind: 'lock-image-mismatch',
      });
    }
  }
  for (const identity of published.keys()) {
    if (lockedImages[identity] === undefined) {
      problems.push({
        detail: 'the pack manifest publishes this image but the lock does not name it',
        identity,
        kind: 'lock-image-unlisted',
      });
    }
  }
  return problems;
}

/**
 * Turns an extracted pack plus a capture tree into the cell inputs `joinOracleState` decides on.
 *
 * Pure over the two directories it is given: it fetches nothing and mutates nothing, so the whole verdict
 * is reproducible from an extracted pack and a capture output.
 */
export function verifyOracleCaptures(
  packRoot: string,
  manifestImages: readonly PackManifestImage[],
  artifactsRoot: string,
  toleranceCatalog: Readonly<ReferenceImageToleranceCatalog>,
): VerifyResult {
  const cells: ReferenceImageCellInput[] = [];
  const problems: VerifyProblem[] = [];

  for (const image of manifestImages) {
    const identity = packManifestImageIdentity(image.path);
    const comparisonPolicy = resolveReferenceImageTolerance(toleranceCatalog, identity);
    const blessedPath = join(packRoot, image.path);

    if (!existsSync(blessedPath)) {
      problems.push({
        detail: `${image.path} is named by the manifest and absent from the pack`,
        identity,
        kind: 'pack-image-missing',
      });
      cells.push({ comparison: null, comparisonPolicy, identity, pinned: false, required: true });
      continue;
    }
    // The blessed bytes are checked against the manifest BEFORE anything is decoded or compared, so a
    // transport fault can never be reported as a render change.
    const blessedBytes = readFileSync(blessedPath);
    const blessedEncoded = createHash('sha256').update(blessedBytes).digest('hex');
    if (blessedEncoded !== image.artifactSha256) {
      problems.push({
        detail: `pack image ${image.path} hashes ${blessedEncoded}, manifest says ${image.artifactSha256}`,
        identity,
        kind: 'pack-image-corrupt',
      });
      cells.push({ comparison: null, comparisonPolicy, identity, pinned: false, required: true });
      continue;
    }

    const parts = identity.split('/');
    const capturePath = join(artifactsRoot, parts[0] ?? '', parts[1] ?? '', parts[2] ?? '', 'screenshot.png');
    if (!existsSync(capturePath)) {
      problems.push({ detail: 'no fresh capture for a pinned reference', identity, kind: 'capture-missing' });
      cells.push({ comparison: null, comparisonPolicy, identity, pinned: true, required: true });
      continue;
    }

    const decoded = decodeOraclePng(readFileSync(capturePath));
    if ('refused' in decoded) {
      problems.push({
        detail: `fresh capture could not be decoded: ${decoded.refused}`,
        identity,
        kind: 'capture-undecodable',
      });
      cells.push({ comparison: null, comparisonPolicy, identity, pinned: true, required: true });
      continue;
    }

    // A dimension change is a VERDICT, not a crash (§9): one resized scene must not abort the corpus.
    if (decoded.png.width !== image.width || decoded.png.height !== image.height) {
      problems.push({
        detail: `capture is ${decoded.png.width}x${decoded.png.height}, reference is ${image.width}x${image.height}`,
        identity,
        kind: 'dimensions',
      });
      cells.push({
        comparison: { dimensionMismatch: true, fraction: 0, maxChannelDelta: 0 },
        comparisonPolicy,
        identity,
        pinned: true,
        required: true,
      });
      continue;
    }

    const reference = comparisonPolicy.overridden ? decodeOraclePng(blessedBytes) : null;
    if (reference !== null && 'refused' in reference) {
      problems.push({
        detail: `blessed reference could not be decoded for its scene override: ${reference.refused}`,
        identity,
        kind: 'pack-image-undecodable',
      });
      cells.push({ comparison: null, comparisonPolicy, identity, pinned: false, required: true });
      continue;
    }
    const compared = compareReferenceImage(
      decoded.png,
      image.pixelSha256,
      reference === null ? null : reference.png,
      comparisonPolicy,
    );
    if ('problem' in compared) {
      problems.push({ detail: compared.problem, identity, kind: 'comparison-unavailable' });
      cells.push({ comparison: null, comparisonPolicy, identity, pinned: true, required: true });
      continue;
    }
    cells.push({ comparison: compared.comparison, comparisonPolicy, identity, pinned: true, required: true });
  }

  return { cells, problems };
}

/** Reads and shape-checks a pack manifest. A malformed manifest is reported, never partially trusted. */
export function readPackManifest(path: string): { images: PackManifestImage[] } | { problem: string } {
  if (!existsSync(path)) return { problem: `no pack manifest at ${path}` };
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    return { problem: `pack manifest did not parse: ${String(error)}` };
  }
  const images = (parsed as { images?: unknown }).images;
  if (!Array.isArray(images) || images.length === 0) return { problem: 'pack manifest lists no images' };
  for (const image of images) {
    const i = image as Partial<PackManifestImage>;
    if (typeof i.path !== 'string' || typeof i.artifactSha256 !== 'string' || typeof i.pixelSha256 !== 'string') {
      return { problem: `pack manifest entry is missing path/artifactSha256/pixelSha256` };
    }
    if (typeof i.width !== 'number' || typeof i.height !== 'number') {
      return { problem: `pack manifest entry ${i.path} is missing width/height` };
    }
  }
  return { images: images as PackManifestImage[] };
}

function packManifestImageIdentity(path: string): string {
  return path.replace(/^images\//, '').replace(/\.png$/, '');
}
