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
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { OracleRequest } from './oracle-records';
import { getOracleRequestCells } from './oracle-records';

export interface OracleCandidateBundle {
  schemaVersion: 1;
  requestId: string;
  /** sha256 of the request file as committed, so intake can bind the bundle to the exact ask. */
  requestSha256: string;
  /** The landed Flight commit. Supplied by the workflow's dispatch envelope, never invented here (§5). */
  flightCommit: string;
  environmentId: string;
  images: readonly OracleCandidateImage[];
}

export type OracleCandidateImage = OracleCandidateCaptured | OracleCandidateMissing;

export interface OracleCandidateCaptured {
  identity: string;
  state: 'captured';
  file: string;
  width: number;
  height: number;
  /** sha256 of the encoded PNG bytes — the transport and promotion identity. */
  artifactSha256: string;
  /** The capture's own decoded-pixel hash, copied from status.json. */
  pixelSha256: string;
}

export interface OracleCandidateMissing {
  identity: string;
  state: 'missing';
  reason: string;
}

export interface OracleCandidateInput {
  request: Readonly<OracleRequest>;
  requestSha256: string;
  flightCommit: string;
  environmentId: string;
  /** Root of the capture output, e.g. `.artifacts`. */
  artifactsRoot: string;
}

/**
 * Assembles the bundle for one request. Pure over the filesystem it is pointed at: it reads captures and
 * returns a record, and never fetches, uploads, or mutates the capture output.
 */
export function buildOracleCandidateBundle(input: Readonly<OracleCandidateInput>): OracleCandidateBundle {
  const images: OracleCandidateImage[] = [];
  for (const identity of getOracleRequestCells(input.request)) {
    images.push(readCandidateImage(input.artifactsRoot, identity));
  }
  return {
    environmentId: input.environmentId,
    flightCommit: input.flightCommit,
    images,
    requestId: input.request.id,
    requestSha256: input.requestSha256,
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

function readCandidateImage(artifactsRoot: string, identity: string): OracleCandidateImage {
  // `subject/entry/renderer` maps onto the capture layout `<root>/<subject>/<entry>/<renderer>`. This is
  // the ONE place the identity string is taken apart, so the §10 ruling lands here and nowhere else.
  const parts = identity.split('/');
  if (parts.length !== 3) return { identity, reason: `unrecognised identity shape`, state: 'missing' };
  const directory = join(artifactsRoot, parts[0]!, parts[1]!, parts[2]!);
  const png = join(directory, 'screenshot.png');
  const statusPath = join(directory, 'status.json');

  if (!existsSync(png)) return { identity, reason: 'no screenshot.png was captured', state: 'missing' };
  if (!existsSync(statusPath)) return { identity, reason: 'no status.json beside the screenshot', state: 'missing' };

  let status: { state?: unknown; hash?: unknown; error?: unknown };
  try {
    status = JSON.parse(readFileSync(statusPath, 'utf8')) as typeof status;
  } catch (error) {
    return { identity, reason: `status.json did not parse: ${String(error)}`, state: 'missing' };
  }
  if (status.state !== 'ready') {
    return {
      identity,
      reason: `capture state '${String(status.state)}': ${String(status.error ?? 'no detail')}`,
      state: 'missing',
    };
  }
  // A blank frame never gets a hash (captureEntry refuses to record one), so an absent hash here means the
  // capture produced no render worth blessing — reported as missing rather than bundled with a null.
  if (typeof status.hash !== 'string' || !/^[0-9a-f]{64}$/.test(status.hash)) {
    return { identity, reason: 'capture recorded no decoded-pixel hash', state: 'missing' };
  }

  const bytes = readFileSync(png);
  const dimensions = readPngDimensions(bytes);
  if (dimensions === null) return { identity, reason: 'screenshot.png is not a readable PNG', state: 'missing' };

  return {
    artifactSha256: createHash('sha256').update(bytes).digest('hex'),
    file: `${identity}.png`,
    height: dimensions.height,
    identity,
    pixelSha256: status.hash,
    state: 'captured',
    width: dimensions.width,
  };
}
