// Builds the candidate bundle a commissioned Flight capture hands to ReferenceImage intake
// (agents/render-reference-image-repository.md §8). Flight produces and dispatches candidates; it never authors
// the ReferenceImage repository's history, so this writes an artifact and stops.
//
// ★ `pixelSha256` IS OVER THE PNG'S DECODED TOP-DOWN RGBA. Flight's capture `hash` prepends dimensions
// and uses browser-decoded pixels, so it answers a different question and is not comparable. Requests,
// locks, pack manifests and comparisons all use `getOraclePngPixelSha256`; one definition binds the image
// selected for commissioning to the image the later workflow actually stages.
//
// ★ `artifactSha256` IS NEW AND IS OVER THE ENCODED FILE. That is the transport identity — what intake
// verifies it received and what release promotes byte-for-byte. §4: "one field cannot truthfully answer
// both questions."
//
// ★ `environmentId` IS RECORDED AS PROVENANCE, NOT USED AS A KEY. §10 ruled one canonical environment
// and one column per backend. Recording WHAT PRODUCED an image remains distinct from keying the set BY it.
//
// ★ EVERY REQUESTED CELL GETS A ROW (§8). A capture that failed is `state: 'missing'` with a reason —
// never absent from the bundle. An absent row is indistinguishable from a cell nobody asked for, which
// is the difference between "we could not render this" and "this was never in scope".
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { getOraclePngPixelSha256 } from './reference-image-png';
import type {
  ReferenceImageRequest,
  ReferenceImageRequestCaptureIdentity,
  ReferenceImageRequestTarget,
} from './reference-image-records';
import { getOracleRequestCells } from './reference-image-records';

export interface ReferenceImageCandidateBundle {
  schemaVersion: 1;
  requestId: string;
  /** `sha256-<64hex>` — the ReferenceImage schema requires the algorithm prefix, not a bare digest. */
  environmentId: string;
  comparisonPolicyId: string;
  captures: readonly ReferenceImageCandidateCapture[];
}

export type ReferenceImageCandidateCapture = ReferenceImageCandidateCaptured | ReferenceImageCandidateMissing;

export interface ReferenceImageCandidateIdentity {
  subject: string;
  entry: string;
  renderer: string;
}

export interface ReferenceImageCandidateCaptured {
  status: 'captured';
  /** Structured, not a slash-joined string: the consumer keys on the parts. */
  identity: ReferenceImageCandidateIdentity;
  /** `images/<subject>/<entry>/<renderer>.png`, relative to candidate.json beside it. */
  file: string;
  provenance: ReferenceImageCandidateProvenance;
}

/** The capture-condition subrecord, copied verbatim from the committed baseline's `sha256Provenance`. */
export interface ReferenceImageCandidateProvenance {
  frames: number;
  sourceHash: string | null;
  targetKind: string | null;
  verifyPublished: boolean;
  warmupFrames: number;
}

export interface ReferenceImageCandidateMissing {
  status: 'missing';
  identity: ReferenceImageCandidateIdentity;
  error: string;
}

export interface ReferenceImageCandidateInput {
  request: Readonly<ReferenceImageRequest>;
  /** Already `sha256-`prefixed by the caller, or a bare digest this will prefix. */
  environmentId: string;
  comparisonPolicyId: string;
  artifactsRoot: string;
  /** Repository root, for reading committed baselines. Defaults to the working directory. */
  repositoryRoot?: string;
}

export const REQUEST_IMAGE_DIFFERENCES_FILE = 'request-image-differences.json';

export interface ReferenceImageRequestedPixelProblem {
  identity: string;
  kind: 'request-image-missing' | 'request-image-unreadable';
  detail: string;
}

export interface ReferenceImageRequestedPixelDifference {
  identity: ReferenceImageCandidateIdentity;
  requestedPixelSha256: string;
  capturedPixelSha256: string;
}

export interface ReferenceImageRequestedPixelEvidence {
  schemaVersion: 1;
  requestId: string;
  differences: readonly ReferenceImageRequestedPixelDifference[];
}

export interface ReferenceImageRequestedPixelVerification {
  /** Missing or unreadable images leave no evidence to review, so they remain fatal. */
  problems: readonly ReferenceImageRequestedPixelProblem[];
  /** Decodable differences are review evidence, not a capture failure once the build commit is bound. */
  evidence: ReferenceImageRequestedPixelEvidence;
}

/** Reads the exact selected image, capture run, and served-build stamp into the v3 target shape. */
export function readBoundOracleRequestTarget(
  root: string,
  identity: string,
  capture: ReferenceImageRequestCaptureIdentity,
): ReferenceImageRequestTarget | { problem: string } {
  const [subject, entry, renderer, extra] = identity.split('/');
  if (subject === undefined || entry === undefined || renderer === undefined || extra !== undefined) {
    return { problem: 'identity is not subject/entry/renderer' };
  }
  const screenshot = join(root, subject, entry, renderer, 'screenshot.png');
  if (!existsSync(screenshot)) return { problem: `no screenshot.png at ${screenshot}` };
  const statusPath = join(root, subject, entry, renderer, 'status.json');
  if (!existsSync(statusPath)) return { problem: `no status.json at ${statusPath}` };
  const pixels = getOraclePngPixelSha256(readFileSync(screenshot));
  if ('refused' in pixels) return { problem: `screenshot.png could not be decoded (${pixels.refused})` };
  let build: NonNullable<ReferenceImageRequestTarget['build']> | null;
  try {
    build = readStatusBuild(JSON.parse(readFileSync(statusPath, 'utf8')) as Record<string, unknown>);
  } catch {
    return { problem: `status.json could not be read at ${statusPath}` };
  }
  if (build === null) {
    return { problem: 'status.json records no valid build stamp; rebuild and recapture before commissioning' };
  }
  return { build, capture, entry, pixelSha256: pixels.pixelSha256, renderer };
}

function readStatusBuild(status: Record<string, unknown>): NonNullable<ReferenceImageRequestTarget['build']> | null {
  const build = status['build'];
  if (typeof build !== 'object' || build === null) return null;
  const value = build as Record<string, unknown>;
  if (value['commit'] !== null && (typeof value['commit'] !== 'string' || !/^[0-9a-f]{40}$/.test(value['commit'])))
    return null;
  if (!Array.isArray(value['dirty'])) return null;
  if (!value['dirty'].every((path) => typeof path === 'string' && path.length > 0)) return null;
  if (
    typeof value['dirtyOmitted'] !== 'number' ||
    !Number.isInteger(value['dirtyOmitted']) ||
    value['dirtyOmitted'] < 0
  )
    return null;
  return value as unknown as NonNullable<ReferenceImageRequestTarget['build']>;
}

/**
 * Compares the later workflow capture with the decoded image the requester selected before any candidate
 * bytes are staged. A missing or unreadable image cannot support review and remains fatal. Once the request
 * binds the code under test to its reviewed commit, a decodable pixel difference is environment evidence:
 * preserve both hashes for review instead of silently accepting it or misclassifying it as code drift.
 */
export function verifyOracleRequestedPixels(
  request: Readonly<ReferenceImageRequest>,
  artifactsRoot: string,
): ReferenceImageRequestedPixelVerification {
  const differences: ReferenceImageRequestedPixelDifference[] = [];
  const problems: ReferenceImageRequestedPixelProblem[] = [];
  for (const target of request.targets) {
    const identity = `${request.subject}/${target.entry}/${target.renderer}`;
    const path = join(artifactsRoot, identity, 'screenshot.png');
    if (!existsSync(path)) {
      problems.push({
        detail: 'the commissioned capture produced no screenshot.png',
        identity,
        kind: 'request-image-missing',
      });
      continue;
    }
    let bytes: Buffer;
    try {
      bytes = readFileSync(path);
    } catch (error) {
      problems.push({
        detail: `the commissioned capture could not be read (${String(error)})`,
        identity,
        kind: 'request-image-unreadable',
      });
      continue;
    }
    const actual = getOraclePngPixelSha256(bytes);
    if ('refused' in actual) {
      problems.push({
        detail: `the commissioned capture could not be decoded (${actual.refused})`,
        identity,
        kind: 'request-image-unreadable',
      });
      continue;
    }
    if (actual.pixelSha256 !== target.pixelSha256) {
      differences.push({
        capturedPixelSha256: actual.pixelSha256,
        identity: { entry: target.entry, renderer: target.renderer, subject: request.subject },
        requestedPixelSha256: target.pixelSha256,
      });
    }
  }
  return { evidence: { differences, requestId: request.id, schemaVersion: 1 }, problems };
}

/**
 * Assembles the candidate for one request, in the shape `flight-reference-images` validates
 * (`schemas/candidate.schema.json`). Pure over the filesystem it is pointed at.
 *
 * ★ THE SCHEMA IS `additionalProperties: false`, SO EXTRA FIELDS ARE A HARD FAILURE, NOT SLACK.
 * Flight's own `artifactSha256`/`pixelSha256`, the landed commit, and the request hash have no home in
 * it — they belong to the dispatch envelope and to ReferenceImage's own records, not to the candidate. Adding
 * them "for completeness" would fail validation at intake, one repository away from the edit.
 */
export function buildOracleCandidateBundle(
  input: Readonly<ReferenceImageCandidateInput>,
): ReferenceImageCandidateBundle {
  const root = input.repositoryRoot ?? process.cwd();
  const captures: ReferenceImageCandidateCapture[] = [];
  for (const identity of getOracleRequestCells(input.request)) {
    captures.push(readCandidateCapture(input.artifactsRoot, root, identity));
  }
  return {
    captures,
    comparisonPolicyId: input.comparisonPolicyId,
    environmentId: input.environmentId.startsWith('sha256-') ? input.environmentId : `sha256-${input.environmentId}`,
    requestId: input.request.id,
    schemaVersion: 1,
  };
}

/** sha256 over a file's bytes. The encoded-artifact identity, and the request-binding hash. */
export function hashOracleFile(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/**
 * Width and height from a PNG's IHDR. These are facts about the format — the 8-byte signature is followed
 * by a 4-byte length, the `IHDR` type, then width and height as big-endian uint32 — so no decoder and no
 * third-party material is involved.
 */
export function readPngDimensions(bytes: Readonly<Uint8Array>): { width: number; height: number } | null {
  if (bytes.length < 24) return null;
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (const [index, expected] of signature.entries()) if (bytes[index] !== expected) return null;
  if (bytes[12] !== 0x49 || bytes[13] !== 0x48 || bytes[14] !== 0x44 || bytes[15] !== 0x52) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { height: view.getUint32(20, false), width: view.getUint32(16, false) };
}

function readCandidateCapture(
  artifactsRoot: string,
  repositoryRoot: string,
  cell: string,
): ReferenceImageCandidateCapture {
  const parts = cell.split('/');
  const identity: ReferenceImageCandidateIdentity = {
    entry: parts[1] ?? '',
    renderer: parts[2] ?? '',
    subject: parts[0] ?? '',
  };
  const miss = (error: string): ReferenceImageCandidateMissing => ({ error, identity, status: 'missing' });
  if (parts.length !== 3) return miss(`unrecognised identity shape: ${cell}`);

  const directory = join(artifactsRoot, parts[0]!, parts[1]!, parts[2]!);
  const png = join(directory, 'screenshot.png');
  const statusPath = join(directory, 'status.json');
  if (!existsSync(png)) return miss('no screenshot.png was captured');
  if (!existsSync(statusPath)) return miss('no status.json beside the screenshot');

  let status: { state?: unknown; hash?: unknown; error?: unknown; provenance?: unknown };
  try {
    status = JSON.parse(readFileSync(statusPath, 'utf8')) as typeof status;
  } catch (error) {
    return miss(`status.json did not parse: ${String(error)}`);
  }
  if (status.state !== 'ready') {
    return miss(`capture state '${String(status.state)}': ${String(status.error ?? 'no detail')}`);
  }
  if (typeof status.hash !== 'string') return miss('capture recorded no decoded-pixel hash');

  // ★ PROVENANCE COMES FROM THIS CAPTURE, NOT FROM THE COMMITTED BASELINE.
  // Reading the baseline was the previous design and it was wrong for the same reason inventing values
  // would have been: the baseline describes SOME EARLIER capture, made under conditions that may differ
  // from the one being blessed. flight-reference-images rejected a candidate over precisely that gap — the record
  // said `frames: 0` from a stale baseline while the commission asked for 1. A stale record is as false
  // as a fabricated one; both assert conditions these bytes were not produced under.
  const provenance = readCaptureProvenance(status);
  if (provenance === null) {
    return miss(`capture recorded no provenance for ${cell} — recapture with a build that writes it`);
  }

  return { file: `images/${cell}.png`, identity, provenance, status: 'captured' };
}

function readCaptureProvenance(status: { provenance?: unknown }): ReferenceImageCandidateProvenance | null {
  const p = status.provenance;
  if (p === undefined || p === null || typeof p !== 'object') return null;
  const r = p as Record<string, unknown>;
  if (typeof r['frames'] !== 'number') return null;
  if (typeof r['verifyPublished'] !== 'boolean') return null;
  if (typeof r['warmupFrames'] !== 'number') return null;
  return {
    frames: r['frames'],
    sourceHash: typeof r['sourceHash'] === 'string' ? r['sourceHash'] : null,
    targetKind: typeof r['targetKind'] === 'string' ? r['targetKind'] : null,
    verifyPublished: r['verifyPublished'],
    warmupFrames: r['warmupFrames'],
  };
}

/**
 * Copies each captured image into a self-contained candidate tree, at exactly the path its record names.
 *
 * ★ THE MANIFEST IS THE ONLY MAP OF THE ARCHIVE. Staging from `captures[].file` rather than re-deriving
 * paths means the two cannot disagree — the failure this replaces was a manifest naming one layout beside
 * an archive holding another, which intake reads as every image missing while the run reports success.
 */
export function stageOracleCandidateImages(
  bundle: Readonly<ReferenceImageCandidateBundle>,
  artifactsRoot: string,
  stageRoot: string,
): number {
  let staged = 0;
  for (const capture of bundle.captures) {
    if (capture.status !== 'captured') continue;
    const { entry, renderer, subject } = capture.identity;
    const source = join(artifactsRoot, subject, entry, renderer, 'screenshot.png');
    const destination = join(stageRoot, capture.file);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(source, destination);
    staged += 1;
  }
  return staged;
}
