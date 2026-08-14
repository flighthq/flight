// Builds the candidate bundle a commissioned Flight capture hands to Oracle intake
// (agents/render-oracle-repository.md §8). Flight produces and dispatches candidates; it never authors
// the Oracle repository's history, so this writes an artifact and stops.
//
// ★ `pixelSha256` IS THE CAPTURE'S EXISTING `hash`, COPIED — NEVER RECOMPUTED. `captureEntry.ts` already
// hashes decoded pixels, in the page, over `"<width>x<height>:"` + raw RGBA, and refuses a blank frame.
// §4 wants a decoded-pixel hash for exactly the reason that field exists: to tell a changed render from
// a changed PNG encoder. Recomputing it here with a second decoder and a second convention would produce
// a value that disagrees with the one already stored beside it for the same image, and nothing
// downstream could say which was right. One definition, one producer, copied forward.
//
// ★ `artifactSha256` IS NEW AND IS OVER THE ENCODED FILE. That is the transport identity — what intake
// verifies it received and what release promotes byte-for-byte. §4: "one field cannot truthfully answer
// both questions."
//
// ★ `environmentId` IS RECORDED AS PROVENANCE, NOT USED AS A KEY. §10 is unruled: whether reference sets
// are keyed per backend or per backend × environment is open, and no schema may presume it. Recording
// WHAT PRODUCED an image is not the same as keying the set BY it — the first is provenance every record
// needs regardless of the ruling, the second is the decision being deferred. When §10 lands, the keying
// changes in the identity generator; this field does not move.
//
// ★ EVERY REQUESTED CELL GETS A ROW (§8). A capture that failed is `state: 'missing'` with a reason —
// never absent from the bundle. An absent row is indistinguishable from a cell nobody asked for, which
// is the difference between "we could not render this" and "this was never in scope".
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { OracleRequest } from './oracle-records';
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

  let status: { state?: unknown; hash?: unknown; error?: unknown };
  try {
    status = JSON.parse(readFileSync(statusPath, 'utf8')) as typeof status;
  } catch (error) {
    return miss(`status.json did not parse: ${String(error)}`);
  }
  if (status.state !== 'ready') {
    return miss(`capture state '${String(status.state)}': ${String(status.error ?? 'no detail')}`);
  }
  if (typeof status.hash !== 'string') return miss('capture recorded no decoded-pixel hash');

  // ★ PROVENANCE IS READ FROM THE COMMITTED BASELINE, NOT INVENTED HERE. `sha256Provenance` is written
  // beside the very hash this capture reproduced, so it describes the conditions those bytes were
  // produced under. Synthesising plausible values would put a record in the Oracle store asserting a
  // capture condition nothing ever observed.
  const provenance = readBaselineProvenance(repositoryRoot, parts[0]!, parts[1]!, parts[2]!);
  if (provenance === null) return miss(`no sha256Provenance recorded for ${cell} in its committed baseline`);

  return { file: `images/${cell}.png`, identity, provenance, status: 'captured' };
}

function readBaselineProvenance(
  repositoryRoot: string,
  subject: string,
  entry: string,
  renderer: string,
): OracleCandidateProvenance | null {
  const path = join(repositoryRoot, subject, 'baselines', `${entry}.json`);
  if (!existsSync(path)) return null;
  try {
    const column = (JSON.parse(readFileSync(path, 'utf8')) as Record<string, Record<string, unknown>>)[renderer];
    const provenance = column?.['sha256Provenance'];
    if (provenance === undefined || provenance === null || typeof provenance !== 'object') return null;
    const p = provenance as Record<string, unknown>;
    if (typeof p['frames'] !== 'number' || typeof p['verifyPublished'] !== 'boolean') return null;
    if (typeof p['warmupFrames'] !== 'number') return null;
    return {
      frames: p['frames'],
      sourceHash: typeof p['sourceHash'] === 'string' ? p['sourceHash'] : null,
      targetKind: typeof p['targetKind'] === 'string' ? p['targetKind'] : null,
      verifyPublished: p['verifyPublished'],
      warmupFrames: p['warmupFrames'],
    };
  } catch {
    return null;
  }
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
