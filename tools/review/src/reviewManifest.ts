import type { ReviewCellRole } from './cellRole';
import type { ReviewCommissionState } from './commissionState';

export interface ReviewCellProvenance {
  hostInstanceId: string | null;
  environmentId: string | null;
}

export interface ReviewBuildProvenance {
  commit: string | null;
  dirty: string[];
  dirtyOmitted: number;
}

export type ReviewParityStatus = 'passed' | 'failed' | 'no-data';

export interface ReviewReferenceImageComparison {
  fraction: number;
  maxChannelDelta: number;
  dimensionMismatch: boolean;
}

export interface ReviewReferenceImageTolerance {
  channelTolerance: number;
  comparisonPolicyId: string;
  gateOnMaxChannelDelta: boolean;
  maxChannelDelta: number;
  maxFraction: number;
  overridden: boolean;
  reason: string | null;
  scene: string;
}

export interface ReviewCell {
  renderer: string;
  role: ReviewCellRole;
  state: 'ready' | 'error';
  error: string | null;
  changed: boolean | null;
  hash: string | null;
  referencePixelSha256: string | null;
  provenance: ReviewCellProvenance | null;
  build: ReviewBuildProvenance | null;
  commissionState: ReviewCommissionState | null;
  comparisonPolicy: ReviewReferenceImageTolerance | null;
  referenceComparison: ReviewReferenceImageComparison | null;
  referenceComparisonMatches: boolean | null;
  referenceComparisonMeasured: boolean;
  referenceComparisonProblem: string | null;
  holdReason: string | null;
  parityStatus: ReviewParityStatus;
}

export interface ReviewTest {
  tool: string;
  name: string;
  cells: ReviewCell[];
  expectedImageDescription?: string;
  sourceHasDescription: boolean;
  toleranceWritable: boolean;
  withheldReason?: string;
}

/** Validates the generated virtual-module payload before browser code trusts it. */
export function parseReviewManifest(value: unknown): ReviewTest[] {
  if (!Array.isArray(value)) throw new Error('review manifest must be an array');
  return value.map((test, index) => parseReviewTest(test, `$[${index}]`));
}

function parseReviewTest(value: unknown, path: string): ReviewTest {
  const source = reviewObject(value, path, [
    'tool',
    'name',
    'cells',
    'expectedImageDescription',
    'sourceHasDescription',
    'toleranceWritable',
    'withheldReason',
  ]);
  if (!Array.isArray(source.cells)) throw new Error(`${path}.cells must be an array`);
  const result: ReviewTest = {
    tool: reviewString(source.tool, `${path}.tool`),
    name: reviewString(source.name, `${path}.name`),
    cells: source.cells.map((cell, index) => parseReviewCell(cell, `${path}.cells[${index}]`)),
    sourceHasDescription: reviewBoolean(source.sourceHasDescription, `${path}.sourceHasDescription`),
    toleranceWritable: reviewBoolean(source.toleranceWritable, `${path}.toleranceWritable`),
  };
  const expectedImageDescription = reviewOptionalString(
    source.expectedImageDescription,
    `${path}.expectedImageDescription`,
  );
  const withheldReason = reviewOptionalString(source.withheldReason, `${path}.withheldReason`);
  if (expectedImageDescription !== undefined) result.expectedImageDescription = expectedImageDescription;
  if (withheldReason !== undefined) result.withheldReason = withheldReason;
  return result;
}

function parseReviewCell(value: unknown, path: string): ReviewCell {
  const source = reviewObject(value, path, [
    'renderer',
    'role',
    'state',
    'error',
    'changed',
    'hash',
    'referencePixelSha256',
    'provenance',
    'build',
    'commissionState',
    'comparisonPolicy',
    'referenceComparison',
    'referenceComparisonMatches',
    'referenceComparisonMeasured',
    'referenceComparisonProblem',
    'holdReason',
    'parityStatus',
  ]);
  return {
    renderer: reviewString(source.renderer, `${path}.renderer`),
    role: reviewEnum(source.role, `${path}.role`, ['reviewable', 'reference']),
    state: reviewEnum(source.state, `${path}.state`, ['ready', 'error']),
    error: reviewNullableString(source.error, `${path}.error`),
    changed: reviewNullableBoolean(source.changed, `${path}.changed`),
    hash: reviewNullableString(source.hash, `${path}.hash`),
    referencePixelSha256: reviewNullableString(source.referencePixelSha256, `${path}.referencePixelSha256`),
    provenance: source.provenance === null ? null : parseReviewCellProvenance(source.provenance, `${path}.provenance`),
    build: source.build === null ? null : parseReviewBuildProvenance(source.build, `${path}.build`),
    commissionState:
      source.commissionState === null
        ? null
        : reviewEnum(source.commissionState, `${path}.commissionState`, [
            'included',
            'differs',
            'not-commissioned',
            'requested',
          ]),
    comparisonPolicy:
      source.comparisonPolicy === null
        ? null
        : parseReviewReferenceImageTolerance(source.comparisonPolicy, `${path}.comparisonPolicy`),
    referenceComparison:
      source.referenceComparison === null
        ? null
        : parseReviewReferenceImageComparison(source.referenceComparison, `${path}.referenceComparison`),
    referenceComparisonMatches: reviewNullableBoolean(
      source.referenceComparisonMatches,
      `${path}.referenceComparisonMatches`,
    ),
    referenceComparisonMeasured: reviewBoolean(
      source.referenceComparisonMeasured,
      `${path}.referenceComparisonMeasured`,
    ),
    referenceComparisonProblem: reviewNullableString(
      source.referenceComparisonProblem,
      `${path}.referenceComparisonProblem`,
    ),
    holdReason: reviewNullableString(source.holdReason, `${path}.holdReason`),
    parityStatus: reviewEnum(source.parityStatus, `${path}.parityStatus`, ['passed', 'failed', 'no-data']),
  };
}

function parseReviewCellProvenance(value: unknown, path: string): ReviewCellProvenance {
  const source = reviewObject(value, path, ['hostInstanceId', 'environmentId']);
  return {
    hostInstanceId: reviewNullableString(source.hostInstanceId, `${path}.hostInstanceId`),
    environmentId: reviewNullableString(source.environmentId, `${path}.environmentId`),
  };
}

function parseReviewBuildProvenance(value: unknown, path: string): ReviewBuildProvenance {
  const source = reviewObject(value, path, ['commit', 'dirty', 'dirtyOmitted']);
  if (!Array.isArray(source.dirty) || !source.dirty.every((item) => typeof item === 'string')) {
    throw new Error(`${path}.dirty must be an array of strings`);
  }
  const dirtyOmitted = reviewNumber(source.dirtyOmitted, `${path}.dirtyOmitted`);
  if (!Number.isInteger(dirtyOmitted) || dirtyOmitted < 0) {
    throw new Error(`${path}.dirtyOmitted must be a non-negative integer`);
  }
  return {
    commit: reviewNullableString(source.commit, `${path}.commit`),
    dirty: [...source.dirty],
    dirtyOmitted,
  };
}

function parseReviewReferenceImageComparison(value: unknown, path: string): ReviewReferenceImageComparison {
  const source = reviewObject(value, path, ['fraction', 'maxChannelDelta', 'dimensionMismatch']);
  return {
    fraction: reviewNumber(source.fraction, `${path}.fraction`),
    maxChannelDelta: reviewNumber(source.maxChannelDelta, `${path}.maxChannelDelta`),
    dimensionMismatch: reviewBoolean(source.dimensionMismatch, `${path}.dimensionMismatch`),
  };
}

function parseReviewReferenceImageTolerance(value: unknown, path: string): ReviewReferenceImageTolerance {
  const source = reviewObject(value, path, [
    'channelTolerance',
    'comparisonPolicyId',
    'gateOnMaxChannelDelta',
    'maxChannelDelta',
    'maxFraction',
    'overridden',
    'reason',
    'scene',
  ]);
  return {
    channelTolerance: reviewNumber(source.channelTolerance, `${path}.channelTolerance`),
    comparisonPolicyId: reviewString(source.comparisonPolicyId, `${path}.comparisonPolicyId`),
    gateOnMaxChannelDelta: reviewBoolean(source.gateOnMaxChannelDelta, `${path}.gateOnMaxChannelDelta`),
    maxChannelDelta: reviewNumber(source.maxChannelDelta, `${path}.maxChannelDelta`),
    maxFraction: reviewNumber(source.maxFraction, `${path}.maxFraction`),
    overridden: reviewBoolean(source.overridden, `${path}.overridden`),
    reason: reviewNullableString(source.reason, `${path}.reason`),
    scene: reviewString(source.scene, `${path}.scene`),
  };
}

function reviewObject(value: unknown, path: string, fields: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  const source = value as Record<string, unknown>;
  const allowed = new Set(fields);
  const unknown = Object.keys(source).find((field) => !allowed.has(field));
  if (unknown !== undefined) throw new Error(`${path}.${unknown} is not part of the review manifest schema`);
  return source;
}

function reviewBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${path} must be a boolean`);
  return value;
}

function reviewNullableBoolean(value: unknown, path: string): boolean | null {
  return value === null ? null : reviewBoolean(value, path);
}

function reviewNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${path} must be a finite number`);
  return value;
}

function reviewString(value: unknown, path: string): string {
  if (typeof value !== 'string') throw new Error(`${path} must be a string`);
  return value;
}

function reviewNullableString(value: unknown, path: string): string | null {
  return value === null ? null : reviewString(value, path);
}

function reviewOptionalString(value: unknown, path: string): string | undefined {
  return value === undefined ? undefined : reviewString(value, path);
}

function reviewEnum<const T extends string>(value: unknown, path: string, values: readonly T[]): T {
  if (typeof value !== 'string' || !values.includes(value as T)) {
    throw new Error(`${path} must be one of ${values.join(', ')}`);
  }
  return value as T;
}
