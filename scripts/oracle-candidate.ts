// Builds the candidate bundle a commissioned Flight capture hands to Oracle intake
// (agents/render-oracle-repository.md §8). Flight produces and dispatches candidates; it never authors
// the Oracle repository's history, so this writes an artifact and stops.
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

import { getOraclePngPixelSha256 } from './oracle-png';
import type { OracleRequest, OracleRequestCaptureIdentity, OracleRequestTarget } from './oracle-records';
import { getOracleRequestCells } from './oracle-records';

export interface OracleCandidateBundle {
  schemaVersion: 1;
  requestId: string;
  /** `sha256-<64hex>` — the Oracle schema requires the algorithm prefix, not a bare digest. */
  environmentId: string;
  comparisonPolicyId: string;
  captures: readonly OracleCandidateCapture[];
}

export type OracleCandidateCapture = OracleCandidateCaptured | OracleCandidateMissing;

export interface OracleCandidateIdentity {
  subject: string;
  entry: string;
  renderer: string;
}

export interface OracleCandidateCaptured {
  status: 'captured';
  /** Structured, not a slash-joined string: the consumer keys on the parts. */
  identity: OracleCandidateIdentity;
  /** `images/<subject>/<entry>/<renderer>.png`, relative to candidate.json beside it. */
  file: string;
  provenance: OracleCandidateProvenance;
}

/** The capture-condition subrecord, copied verbatim from the committed baseline's `sha256Provenance`. */
export interface OracleCandidateProvenance {
  frames: number;
  sourceHash: string | null;
  targetKind: string | null;
  verifyPublished: boolean;
  warmupFrames: number;
}

export interface OracleCandidateMissing {
  status: 'missing';
  identity: OracleCandidateIdentity;
  error: string;
}

export interface OracleCandidateInput {
  request: Readonly<OracleRequest>;
  /** Already `sha256-`prefixed by the caller, or a bare digest this will prefix. */
  environmentId: string;
  comparisonPolicyId: string;
  artifactsRoot: string;
  /** Repository root, for reading committed baselines. Defaults to the working directory. */
  repositoryRoot?: string;
}

export interface OracleRequestedPixelProblem {
  identity: string;
  kind: 'request-image-missing' | 'request-image-unreadable' | 'request-image-mismatch';
  detail: string;
}

/** Reads the exact selected image and run identity into the v2 request target shape. */
export function readBoundOracleRequestTarget(
  root: string,
  identity: string,
  capture: OracleRequestCaptureIdentity,
): OracleRequestTarget | { problem: string } {
  const [subject, entry, renderer, extra] = identity.split('/');
  if (subject === undefined || entry === undefined || renderer === undefined || extra !== undefined) {
    return { problem: 'identity is not subject/entry/renderer' };
  }
  const screenshot = join(root, subject, entry, renderer, 'screenshot.png');
  if (!existsSync(screenshot)) return { problem: `no screenshot.png at ${screenshot}` };
  const pixels = getOraclePngPixelSha256(readFileSync(screenshot));
  if ('refused' in pixels) return { problem: `screenshot.png could not be decoded (${pixels.refused})` };
  return { capture, entry, pixelSha256: pixels.pixelSha256, renderer };
}

/**
 * Proves the later workflow capture is the decoded image the requester selected, before any candidate
 * bytes are staged. A request is authority over bytes, not merely over a cell name.
 */
export function verifyOracleRequestedPixels(
  request: Readonly<OracleRequest>,
  artifactsRoot: string,
): OracleRequestedPixelProblem[] {
  const problems: OracleRequestedPixelProblem[] = [];
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
    const actual = getOraclePngPixelSha256(readFileSync(path));
    if ('refused' in actual) {
      problems.push({
        detail: `the commissioned capture could not be decoded (${actual.refused})`,
        identity,
        kind: 'request-image-unreadable',
      });
      continue;
    }
    if (actual.pixelSha256 !== target.pixelSha256) {
      problems.push({
        detail: `request selected ${target.pixelSha256}, commissioned capture produced ${actual.pixelSha256}`,
        identity,
        kind: 'request-image-mismatch',
      });
    }
  }
  return problems;
}

/**
 * Assembles the candidate for one request, in the shape `flight-oracles` validates
 * (`schemas/candidate.schema.json`). Pure over the filesystem it is pointed at.
 *
 * ★ THE SCHEMA IS `additionalProperties: false`, SO EXTRA FIELDS ARE A HARD FAILURE, NOT SLACK.
 * Flight's own `artifactSha256`/`pixelSha256`, the landed commit, and the request hash have no home in
 * it — they belong to the dispatch envelope and to Oracle's own records, not to the candidate. Adding
 * them "for completeness" would fail validation at intake, one repository away from the edit.
 */
export function buildOracleCandidateBundle(input: Readonly<OracleCandidateInput>): OracleCandidateBundle {
  const root = input.repositoryRoot ?? process.cwd();
  const captures: OracleCandidateCapture[] = [];
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

function readCandidateCapture(artifactsRoot: string, repositoryRoot: string, cell: string): OracleCandidateCapture {
  const parts = cell.split('/');
  const identity: OracleCandidateIdentity = {
    entry: parts[1] ?? '',
    renderer: parts[2] ?? '',
    subject: parts[0] ?? '',
  };
  const miss = (error: string): OracleCandidateMissing => ({ error, identity, status: 'missing' });
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
  // from the one being blessed. flight-oracles rejected a candidate over precisely that gap — the record
  // said `frames: 0` from a stale baseline while the commission asked for 1. A stale record is as false
  // as a fabricated one; both assert conditions these bytes were not produced under.
  const provenance = readCaptureProvenance(status);
  if (provenance === null) {
    return miss(`capture recorded no provenance for ${cell} — recapture with a build that writes it`);
  }

  return { file: `images/${cell}.png`, identity, provenance, status: 'captured' };
}

function readCaptureProvenance(status: { provenance?: unknown }): OracleCandidateProvenance | null {
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
  bundle: Readonly<OracleCandidateBundle>,
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
