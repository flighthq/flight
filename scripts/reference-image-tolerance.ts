// The single policy seam for per-scene reference-image comparisons. Both the CI consumer and the
// review manifest import this module: validation, scene resolution, pixel comparison and the verdict
// must not acquire subtly different "convenient" implementations on either side of the review loop.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { compareOracleReference } from './reference-image-compare';
import type { ReferenceImageBitmap, ReferenceImageCellComparison } from './reference-image-compare';
import { hashOraclePixelBytes } from './reference-image-png';

export const LEGACY_EXACT_COMPARISON_POLICY_ID = 'pixel-exact-swiftshader-pw-1-61-v1';

export interface ReferenceImageVerdictPolicy {
  comparisonPolicyId: string;
  maxFraction: number;
  gateOnMaxChannelDelta: boolean;
  maxChannelDelta: number;
}

export interface ReferenceImageSceneTolerance {
  channelTolerance: number;
  maxFraction: number;
  gateOnMaxChannelDelta: boolean;
  maxChannelDelta: number;
  reason: string;
}

export interface ResolvedReferenceImageTolerance extends ReferenceImageVerdictPolicy {
  channelTolerance: number;
  /** `null` is the exact-by-absence rule, never an implicit repository-wide fuzzy default. */
  reason: string | null;
  scene: string;
  overridden: boolean;
}

export interface ReferenceImageToleranceCatalog {
  schemaVersion: 1;
  comparisonPolicyId: string;
  scenes: Readonly<Record<string, Readonly<ReferenceImageSceneTolerance>>>;
  comment?: string;
}

export interface ReferenceImageToleranceProblem {
  path: string;
  detail: string;
}

export interface ReferenceImageTolerancePaths {
  manifestPath: string;
  captureIdentityPath: string;
  coverageManifestPath: string;
}

export type ReadReferenceImageToleranceCatalogResult =
  | { catalog: ReferenceImageToleranceCatalog }
  | { problems: readonly ReferenceImageToleranceProblem[] };

export interface DecodedReferenceImagePixels {
  width: number;
  height: number;
  data: Readonly<Uint8Array>;
}

export interface ReferenceImageComparisonResult {
  candidatePixelSha256: string;
  comparison: ReferenceImageCellComparison;
  matches: boolean;
  /** False only when exact comparison used its hash fast path because blessed pixels were unavailable. */
  measured: boolean;
}

export type CompareReferenceImageResult = ReferenceImageComparisonResult | { problem: string };

const TOP_LEVEL_FIELDS = new Set(['$comment', 'schemaVersion', 'comparisonPolicyId', 'scenes']);
const SCENE_FIELDS = new Set(['channelTolerance', 'maxFraction', 'gateOnMaxChannelDelta', 'maxChannelDelta', 'reason']);

/** Reads all three committed records and rejects the whole catalog when any link is malformed. */
export function readReferenceImageToleranceCatalog(
  paths: Readonly<ReferenceImageTolerancePaths>,
): ReadReferenceImageToleranceCatalogResult {
  const manifest = readJson(paths.manifestPath, 'tolerance manifest');
  const identity = readJson(paths.captureIdentityPath, 'capture identity');
  const coverage = readJson(paths.coverageManifestPath, 'coverage manifest');
  if ('problem' in manifest || 'problem' in identity || 'problem' in coverage) {
    return {
      problems: [manifest, identity, coverage].flatMap((result) => ('problem' in result ? [result.problem] : [])),
    };
  }

  const comparisonPolicyId = objectString(identity.value, 'comparisonPolicyId');
  if (comparisonPolicyId === null) {
    return { problems: [{ path: paths.captureIdentityPath, detail: 'comparisonPolicyId must be a non-empty string' }] };
  }
  const scenes = readKnownReferenceImageScenes(coverage.value, paths.coverageManifestPath);
  if ('problems' in scenes) return scenes;
  return parseReferenceImageToleranceCatalog(manifest.value, comparisonPolicyId, scenes.scenes);
}

/** Shape-checks a parsed manifest. Exported so tests and future record tooling exercise the production parser. */
export function parseReferenceImageToleranceCatalog(
  value: unknown,
  expectedComparisonPolicyId: string,
  knownScenes: ReadonlySet<string>,
): ReadReferenceImageToleranceCatalogResult {
  const problems: ReferenceImageToleranceProblem[] = [];
  if (!isObject(value)) return { problems: [{ path: '$', detail: 'manifest must be an object' }] };

  rejectUnknownFields(value, TOP_LEVEL_FIELDS, '$', problems);
  if (value['schemaVersion'] !== 1) problems.push({ path: '$.schemaVersion', detail: 'must equal 1' });
  const policyId = objectString(value, 'comparisonPolicyId');
  if (policyId === null) {
    problems.push({ path: '$.comparisonPolicyId', detail: 'must be a non-empty string' });
  } else if (policyId !== expectedComparisonPolicyId) {
    problems.push({
      path: '$.comparisonPolicyId',
      detail: `must match capture identity ${expectedComparisonPolicyId}, received ${policyId}`,
    });
  }
  if (value['$comment'] !== undefined && typeof value['$comment'] !== 'string') {
    problems.push({ path: '$.$comment', detail: 'must be a string when present' });
  }

  const rawScenes = value['scenes'];
  if (!isObject(rawScenes)) {
    problems.push({ path: '$.scenes', detail: 'must be an object' });
  }
  const parsedScenes: Record<string, ReferenceImageSceneTolerance> = {};
  if (isObject(rawScenes)) {
    for (const [scene, raw] of Object.entries(rawScenes)) {
      if (!knownScenes.has(scene)) problems.push({ path: `$.scenes.${scene}`, detail: 'is not a required live scene' });
      const parsed = parseSceneTolerance(raw, `$.scenes.${scene}`, problems);
      if (parsed !== null) parsedScenes[scene] = parsed;
    }
  }
  if (policyId === LEGACY_EXACT_COMPARISON_POLICY_ID && Object.keys(parsedScenes).length > 0) {
    problems.push({
      path: '$.scenes',
      detail: `${LEGACY_EXACT_COMPARISON_POLICY_ID} is registered as exact and cannot carry scene overrides`,
    });
  }
  if (problems.length > 0) return { problems };

  return {
    catalog: {
      ...(typeof value['$comment'] === 'string' ? { comment: value['$comment'] } : {}),
      comparisonPolicyId: policyId!,
      scenes: parsedScenes,
      schemaVersion: 1,
    },
  };
}

/** Resolves `subject/scene/renderer` to a scene policy; absence is deliberately pixel exact. */
export function resolveReferenceImageTolerance(
  catalog: Readonly<ReferenceImageToleranceCatalog>,
  cellIdentity: string,
): ResolvedReferenceImageTolerance {
  const scene = referenceImageScene(cellIdentity);
  const override = catalog.scenes[scene];
  if (override === undefined) {
    return {
      channelTolerance: 0,
      comparisonPolicyId: catalog.comparisonPolicyId,
      gateOnMaxChannelDelta: true,
      maxChannelDelta: 0,
      maxFraction: 0,
      overridden: false,
      reason: null,
      scene,
    };
  }
  return { ...override, comparisonPolicyId: catalog.comparisonPolicyId, overridden: true, scene };
}

/**
 * The shared comparator. Exact-by-absence may use the locked decoded-pixel hash; an override requires
 * actual blessed pixels and uses the existing bitmap mismatch primitive through its corpus adapter.
 */
export function compareReferenceImage(
  candidate: Readonly<DecodedReferenceImagePixels>,
  expectedPixelSha256: string,
  reference: Readonly<DecodedReferenceImagePixels> | null,
  policy: Readonly<ResolvedReferenceImageTolerance>,
): CompareReferenceImageResult {
  const candidatePixelSha256 = hashOraclePixelBytes(candidate.data);
  if (reference !== null) {
    const referencePixelSha256 = hashOraclePixelBytes(reference.data);
    if (referencePixelSha256 !== expectedPixelSha256) {
      return {
        problem: `blessed pixels hash ${referencePixelSha256}, but the lock expects ${expectedPixelSha256}`,
      };
    }
  }
  if (!policy.overridden && reference === null) {
    const same = candidatePixelSha256 === expectedPixelSha256;
    const comparison = {
      dimensionMismatch: false,
      fraction: same ? 0 : 1,
      maxChannelDelta: same ? 0 : 255,
    };
    return {
      candidatePixelSha256,
      comparison,
      matches: referenceImageComparisonPasses(comparison, policy),
      measured: false,
    };
  }
  if (reference === null) {
    return { problem: `scene ${policy.scene} has a tolerance override but its blessed pixels are unavailable` };
  }
  const comparison = compareOracleReference(asBitmap(reference), asBitmap(candidate), policy.channelTolerance);
  return {
    candidatePixelSha256,
    comparison,
    matches: referenceImageComparisonPasses(comparison, policy),
    measured: true,
  };
}

/** The one verdict implementation used by both the join and review-tool commission state. */
export function referenceImageComparisonPasses(
  comparison: Readonly<ReferenceImageCellComparison>,
  policy: Readonly<ReferenceImageVerdictPolicy>,
): boolean {
  return (
    !comparison.dimensionMismatch &&
    comparison.fraction <= policy.maxFraction &&
    (!policy.gateOnMaxChannelDelta || comparison.maxChannelDelta <= policy.maxChannelDelta)
  );
}

/** Writes a reviewed scene override, or `null` to delete it and restore exact-by-absence. */
export function writeReferenceImageSceneTolerance(
  paths: Readonly<ReferenceImageTolerancePaths>,
  scene: string,
  tolerance: Readonly<ReferenceImageSceneTolerance> | null,
): ReadReferenceImageToleranceCatalogResult {
  const current = readReferenceImageToleranceCatalog(paths);
  if ('problems' in current) return current;
  if (tolerance !== null && current.catalog.comparisonPolicyId === LEGACY_EXACT_COMPARISON_POLICY_ID) {
    return {
      problems: [
        {
          path: `$.scenes.${scene}`,
          detail: 'cannot add an override until flight-reference-images registers a per-scene comparison policy',
        },
      ],
    };
  }
  const raw = {
    ...(current.catalog.comment === undefined ? {} : { $comment: current.catalog.comment }),
    schemaVersion: 1,
    comparisonPolicyId: current.catalog.comparisonPolicyId,
    scenes: Object.fromEntries(
      Object.entries({ ...current.catalog.scenes, [scene]: tolerance })
        .filter((entry): entry is [string, ReferenceImageSceneTolerance] => entry[1] !== null)
        .sort(([left], [right]) => left.localeCompare(right)),
    ),
  };
  const knownScenes = readKnownScenesFromPath(paths.coverageManifestPath);
  if ('problems' in knownScenes) return knownScenes;
  const validated = parseReferenceImageToleranceCatalog(raw, current.catalog.comparisonPolicyId, knownScenes.scenes);
  if ('problems' in validated) return validated;
  writeFileSync(paths.manifestPath, `${JSON.stringify(raw, null, 2)}\n`);
  return validated;
}

function parseSceneTolerance(
  value: unknown,
  path: string,
  problems: ReferenceImageToleranceProblem[],
): ReferenceImageSceneTolerance | null {
  if (!isObject(value)) {
    problems.push({ path, detail: 'must be an object' });
    return null;
  }
  rejectUnknownFields(value, SCENE_FIELDS, path, problems);
  const channelTolerance = integerInRange(value['channelTolerance'], 0, 255, `${path}.channelTolerance`, problems);
  const maxFraction = numberInRange(value['maxFraction'], 0, 1, `${path}.maxFraction`, problems);
  const maxChannelDelta = integerInRange(value['maxChannelDelta'], 0, 255, `${path}.maxChannelDelta`, problems);
  const gateOnMaxChannelDelta = value['gateOnMaxChannelDelta'];
  if (typeof gateOnMaxChannelDelta !== 'boolean') {
    problems.push({ path: `${path}.gateOnMaxChannelDelta`, detail: 'must be a boolean' });
  }
  const reason = typeof value['reason'] === 'string' ? value['reason'].trim() : '';
  if (reason === '') problems.push({ path: `${path}.reason`, detail: 'must be a non-empty string' });
  if (
    channelTolerance === null ||
    maxFraction === null ||
    maxChannelDelta === null ||
    typeof gateOnMaxChannelDelta !== 'boolean' ||
    reason === ''
  ) {
    return null;
  }
  return { channelTolerance, gateOnMaxChannelDelta, maxChannelDelta, maxFraction, reason };
}

function readKnownScenesFromPath(
  path: string,
): { scenes: Set<string> } | { problems: readonly ReferenceImageToleranceProblem[] } {
  const coverage = readJson(path, 'coverage manifest');
  return 'problem' in coverage ? { problems: [coverage.problem] } : readKnownReferenceImageScenes(coverage.value, path);
}

function readKnownReferenceImageScenes(
  value: unknown,
  path: string,
): { scenes: Set<string> } | { problems: readonly ReferenceImageToleranceProblem[] } {
  if (!isObject(value) || !isObject(value['subjects'])) {
    return { problems: [{ path, detail: 'coverage manifest subjects must be an object' }] };
  }
  const scenes = new Set<string>();
  for (const [subject, cells] of Object.entries(value['subjects'])) {
    if (!isObject(cells)) return { problems: [{ path, detail: `coverage subject ${subject} must be an object` }] };
    for (const [cell, rawKinds] of Object.entries(cells)) {
      if (!Array.isArray(rawKinds) || !rawKinds.every((kind) => typeof kind === 'string')) {
        return { problems: [{ path, detail: `coverage cell ${subject}/${cell} must list string evidence kinds` }] };
      }
      const rendererSeparator = cell.lastIndexOf('/');
      if (rendererSeparator <= 0) {
        return { problems: [{ path, detail: `coverage cell ${subject}/${cell} has no renderer segment` }] };
      }
      if (rawKinds.includes('referenceImage')) scenes.add(`${subject}/${cell.slice(0, rendererSeparator)}`);
    }
  }
  return { scenes };
}

function referenceImageScene(cellIdentity: string): string {
  const rendererSeparator = cellIdentity.lastIndexOf('/');
  if (rendererSeparator <= 0 || rendererSeparator === cellIdentity.length - 1) {
    throw new Error(`reference-image cell identity must be subject/scene/renderer, received ${cellIdentity}`);
  }
  return cellIdentity.slice(0, rendererSeparator);
}

function asBitmap(pixels: Readonly<DecodedReferenceImagePixels>): ReferenceImageBitmap {
  return { data: pixels.data, height: pixels.height, width: pixels.width };
}

function readJson(path: string, label: string): { value: unknown } | { problem: ReferenceImageToleranceProblem } {
  if (!existsSync(path)) return { problem: { path, detail: `${label} does not exist` } };
  try {
    return { value: JSON.parse(readFileSync(path, 'utf8')) as unknown };
  } catch (error) {
    return { problem: { path, detail: `${label} did not parse: ${String(error)}` } };
  }
}

function objectString(value: unknown, key: string): string | null {
  if (!isObject(value)) return null;
  const member = value[key];
  return typeof member === 'string' && member.trim() !== '' ? member : null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function rejectUnknownFields(
  value: Readonly<Record<string, unknown>>,
  fields: ReadonlySet<string>,
  path: string,
  problems: ReferenceImageToleranceProblem[],
): void {
  for (const key of Object.keys(value)) {
    if (!fields.has(key)) problems.push({ path: `${path}.${key}`, detail: 'is not a recognized field' });
  }
}

function integerInRange(
  value: unknown,
  minimum: number,
  maximum: number,
  path: string,
  problems: ReferenceImageToleranceProblem[],
): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum || value > maximum) {
    problems.push({ path, detail: `must be an integer from ${minimum} through ${maximum}` });
    return null;
  }
  return value;
}

function numberInRange(
  value: unknown,
  minimum: number,
  maximum: number,
  path: string,
  problems: ReferenceImageToleranceProblem[],
): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    problems.push({ path, detail: `must be a finite number from ${minimum} through ${maximum}` });
    return null;
  }
  return value;
}
