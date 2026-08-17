// The two Flight-owned records of the render-oracle proposal (agents/render-oracle-repository.md §5):
// the immutable consumer lock, and the outstanding-commission queue. Parsing and validation only —
// the join that turns these into CI verdicts is `oracle-state.ts`.
//
// ★ THREE RECORDS, THREE MEANINGS, AND THEY ARE NOT MERGEABLE (§5). The coverage manifest says which
// identities OWE a referent; a request says which are being re-commissioned and why; the lock says
// which immutable bytes satisfy them. Collapsing any two would let an agent make CI green by deleting
// the thing CI was meant to require — the coverage manifest already carries that argument for its own
// subject (`captureBaselineCoverageManifest.ts`) and it is the same argument here.
//
// ★ IDENTITIES ARE OPAQUE STRINGS ON PURPOSE. §10 ruled one column per backend, while the environment and
// host that produced a requested image remain provenance about that image rather than part of its key.
// Nothing in this file or in `oracle-state.ts` parses an identity.
//
// Types are declared locally rather than in `@flighthq/types` because `scripts/` is outside the package
// graph — the same reason `FixtureExtractionVerification` lives in `scripts/fixtures.ts`.
import { readFileSync } from 'node:fs';

export interface OracleLock {
  schemaVersion: 2;
  /** `owner/name` of the repository whose releases supply the blessed bytes. */
  repository: string;
  /** The 40-hex Oracle commit the release was cut from. */
  oracleCommit: string;
  /** The immutable release tag. Never `latest` — see FIXTURE_RELEASE_TAG for the same argument. */
  releaseTag: string;
  manifestSha256: string;
  /** Pack id → the asset and exact image identities it carries. */
  packs: Record<string, OracleLockPack>;
}

export interface OracleLockPack {
  file: string;
  sha256: string;
  /** Opaque `subject/entry/renderer` identity → its decoded-pixel identity. */
  images: Record<string, OracleLockImage>;
}

export interface OracleLockImage {
  pixelSha256: string;
}

export interface OracleRequest {
  schemaVersion: 2;
  id: string;
  subject: string;
  targets: readonly OracleRequestTarget[];
  frames: number;
  reason: string;
}

export interface OracleRequestTarget {
  entry: string;
  renderer: string;
  /** Decoded top-down RGBA sha256, using the same identity as `OracleLockImage.pixelSha256`. */
  pixelSha256: string;
  /** The selected capture run, recorded as provenance rather than folded into the image key. */
  capture: OracleRequestCaptureIdentity;
}

export interface OracleRequestCaptureIdentity {
  hostInstanceId: string;
  environmentId: string;
}

/** A record that did not parse, named so a caller can report it rather than throw over the corpus. */
export interface OracleRecordProblem {
  /** The file the problem was found in, as given to the reader. */
  source: string;
  /** Machine-readable, and stable enough to assert on in a firing test. */
  kind: OracleRecordProblemKind;
  detail: string;
}

export type OracleRecordProblemKind =
  | 'not-json'
  | 'not-an-object'
  | 'schema-version'
  | 'field-missing'
  | 'field-type'
  | 'field-empty'
  | 'duplicate-image'
  | 'duplicate-target';

const HEX_40 = /^[0-9a-f]{40}$/;
const HEX_64 = /^[0-9a-f]{64}$/;

/**
 * Reads and validates a consumer lock. Returns the lock, or every problem found — a malformed lock is a
 * reportable condition, not a crash, because CI must name it in the summary alongside the cells it
 * could not verify.
 */
export function readOracleLock(path: string): OracleLockResult {
  const parsed = readJsonRecord(path);
  if ('problems' in parsed) return parsed;
  const value = parsed.value;
  const problems: OracleRecordProblem[] = [];

  requireSchemaVersion(problems, path, value, 2);
  requireNonEmptyString(problems, path, value, 'repository');
  requirePattern(problems, path, value, 'oracleCommit', HEX_40, 'a 40-hex commit');
  requireNonEmptyString(problems, path, value, 'releaseTag');
  requirePattern(problems, path, value, 'manifestSha256', HEX_64, 'a 64-hex sha256');

  const packs = value['packs'];
  if (packs === undefined) problems.push(problem(path, 'field-missing', 'packs is missing'));
  else if (!isPlainObject(packs)) problems.push(problem(path, 'field-type', 'packs must be an object'));
  else if (Object.keys(packs).length === 0) problems.push(problem(path, 'field-empty', 'packs is empty'));
  else {
    const seenImages = new Set<string>();
    for (const [id, pack] of Object.entries(packs)) {
      if (!isPlainObject(pack)) {
        problems.push(problem(path, 'field-type', `packs.${id} must be an object`));
        continue;
      }
      requireNonEmptyString(problems, path, pack, `packs.${id}.file`, pack['file']);
      requirePattern(problems, path, pack, `packs.${id}.sha256`, HEX_64, 'a 64-hex sha256', pack['sha256']);

      const images = pack['images'];
      if (images === undefined) problems.push(problem(path, 'field-missing', `packs.${id}.images is missing`));
      else if (!isPlainObject(images)) {
        problems.push(problem(path, 'field-type', `packs.${id}.images must be an object`));
      } else if (Object.keys(images).length === 0) {
        problems.push(problem(path, 'field-empty', `packs.${id}.images is empty`));
      } else {
        for (const [identity, image] of Object.entries(images)) {
          if (identity.length === 0) problems.push(problem(path, 'field-empty', `packs.${id}.images has an empty key`));
          if (seenImages.has(identity)) {
            problems.push(problem(path, 'duplicate-image', `${identity} is named by more than one pack`));
          }
          seenImages.add(identity);
          if (!isPlainObject(image)) {
            problems.push(problem(path, 'field-type', `packs.${id}.images.${identity} must be an object`));
            continue;
          }
          requirePattern(
            problems,
            path,
            image,
            `packs.${id}.images.${identity}.pixelSha256`,
            HEX_64,
            'a 64-hex sha256',
            image['pixelSha256'],
          );
        }
      }
    }
  }

  return problems.length > 0 ? { problems } : { lock: value as unknown as OracleLock };
}

export type OracleLockResult = { lock: OracleLock } | { problems: OracleRecordProblem[] };

/** Every exact image the committed lock supplies, keyed for direct request and eligibility lookups. */
export function getOracleLockImages(lock: Readonly<OracleLock>): ReadonlyMap<string, Readonly<OracleLockImage>> {
  const images = new Map<string, Readonly<OracleLockImage>>();
  for (const pack of Object.values(lock.packs)) {
    for (const [identity, image] of Object.entries(pack.images)) images.set(identity, image);
  }
  return images;
}

/**
 * Reads and validates one outstanding commission. A request names live targets and a reason; it never
 * carries the SHA of the commit containing it (§5) — that self-reference cannot be known before the
 * commit exists, and the trusted workflow binds the request to the landed `github.sha` instead.
 */
export function readOracleRequest(path: string): OracleRequestResult {
  const parsed = readJsonRecord(path);
  if ('problems' in parsed) return parsed;
  const value = parsed.value;
  const problems: OracleRecordProblem[] = [];

  requireSchemaVersion(problems, path, value, 2);
  requireNonEmptyString(problems, path, value, 'id');
  requireNonEmptyString(problems, path, value, 'subject');
  requireNonEmptyString(problems, path, value, 'reason');

  const frames = value['frames'];
  if (frames === undefined) problems.push(problem(path, 'field-missing', 'frames is missing'));
  else if (typeof frames !== 'number' || !Number.isInteger(frames) || frames < 1) {
    problems.push(problem(path, 'field-type', 'frames must be a positive integer'));
  }

  const targets = value['targets'];
  if (targets === undefined) problems.push(problem(path, 'field-missing', 'targets is missing'));
  else if (!Array.isArray(targets)) problems.push(problem(path, 'field-type', 'targets must be an array'));
  else if (targets.length === 0) problems.push(problem(path, 'field-empty', 'targets is empty'));
  else {
    const seen = new Set<string>();
    for (const [index, target] of targets.entries()) {
      if (!isPlainObject(target)) {
        problems.push(problem(path, 'field-type', `targets[${index}] must be an object`));
        continue;
      }
      requireNonEmptyString(problems, path, target, `targets[${index}].entry`, target['entry']);
      requireNonEmptyString(problems, path, target, `targets[${index}].renderer`, target['renderer']);
      requirePattern(
        problems,
        path,
        target,
        `targets[${index}].pixelSha256`,
        HEX_64,
        'a 64-hex sha256',
        target['pixelSha256'],
      );

      const capture = target['capture'];
      if (capture === undefined) problems.push(problem(path, 'field-missing', `targets[${index}].capture is missing`));
      else if (!isPlainObject(capture)) {
        problems.push(problem(path, 'field-type', `targets[${index}].capture must be an object`));
      } else {
        requireNonEmptyString(
          problems,
          path,
          capture,
          `targets[${index}].capture.hostInstanceId`,
          capture['hostInstanceId'],
        );
        requireNonEmptyString(
          problems,
          path,
          capture,
          `targets[${index}].capture.environmentId`,
          capture['environmentId'],
        );
      }

      // A request that names the same cell twice would let one entry be satisfied while the other
      // silently keeps the cell pending, so it is rejected at the door rather than deduplicated.
      const cell = `${String(target['entry'])}/${String(target['renderer'])}`;
      if (seen.has(cell)) problems.push(problem(path, 'duplicate-target', `${cell} is named twice`));
      seen.add(cell);
    }
  }

  return problems.length > 0 ? { problems } : { request: value as unknown as OracleRequest };
}

export type OracleRequestResult = { request: OracleRequest } | { problems: OracleRecordProblem[] };

/**
 * The cells one request claims, as `subject/entry/renderer`. This is the ONLY place a request's scope is
 * expanded, so "in scope" has exactly one definition for the pending allowance and the out-of-scope gate.
 */
export function getOracleRequestCells(request: Readonly<OracleRequest>): string[] {
  return request.targets.map((target) => `${request.subject}/${target.entry}/${target.renderer}`);
}

function readJsonRecord(path: string): { value: Record<string, unknown> } | { problems: OracleRecordProblem[] } {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    return { problems: [problem(path, 'not-json', `unreadable: ${String(error)}`)] };
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return { problems: [problem(path, 'not-json', String(error))] };
  }
  if (!isPlainObject(value)) return { problems: [problem(path, 'not-an-object', 'the root value is not an object')] };
  return { value };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function problem(source: string, kind: OracleRecordProblemKind, detail: string): OracleRecordProblem {
  return { source, kind, detail };
}

function requireNonEmptyString(
  problems: OracleRecordProblem[],
  source: string,
  holder: Record<string, unknown>,
  field: string,
  value: unknown = holder[field],
): void {
  if (value === undefined) problems.push(problem(source, 'field-missing', `${field} is missing`));
  else if (typeof value !== 'string') problems.push(problem(source, 'field-type', `${field} must be a string`));
  else if (value.length === 0) problems.push(problem(source, 'field-empty', `${field} is empty`));
}

function requirePattern(
  problems: OracleRecordProblem[],
  source: string,
  holder: Record<string, unknown>,
  field: string,
  pattern: RegExp,
  expectation: string,
  value: unknown = holder[field],
): void {
  if (value === undefined) problems.push(problem(source, 'field-missing', `${field} is missing`));
  else if (typeof value !== 'string') problems.push(problem(source, 'field-type', `${field} must be a string`));
  else if (!pattern.test(value)) problems.push(problem(source, 'field-type', `${field} must be ${expectation}`));
}

function requireSchemaVersion(
  problems: OracleRecordProblem[],
  source: string,
  value: Record<string, unknown>,
  expected: number,
): void {
  const actual = value['schemaVersion'];
  if (actual === undefined) problems.push(problem(source, 'field-missing', 'schemaVersion is missing'));
  else if (actual !== expected) {
    problems.push(problem(source, 'schema-version', `schemaVersion ${String(actual)} is not ${expected}`));
  }
}
