import type { ReviewCommissionState } from './commissionState';

export interface ReviewReferenceHashCell {
  /** Capture-baseline identity from status.json. */
  hash: string | null;
  /** Decoded top-down RGBA identity shared with reference-image locks and requests. */
  referencePixelSha256: string | null;
}

export function resolveReferenceImageCommissionState(
  cell: ReviewReferenceHashCell,
  lockedPixelSha256: string | undefined,
  requested: boolean,
  /** Shared comparator verdict. When present it is authoritative over the exact-hash legacy path. */
  comparisonMatches?: boolean | null,
): ReviewCommissionState {
  if (lockedPixelSha256 !== undefined) {
    if (comparisonMatches !== undefined && comparisonMatches !== null) {
      return comparisonMatches ? 'included' : 'differs';
    }
    return cell.referencePixelSha256 !== null && cell.referencePixelSha256 === lockedPixelSha256
      ? 'included'
      : 'differs';
  }
  return requested ? 'requested' : 'not-commissioned';
}

interface ReviewCommissionPayloadSource extends ReviewReferenceHashCell {
  renderer: string;
  provenance: { hostInstanceId: string | null; environmentId: string | null } | null;
  build: { commit: string | null; dirty: string[]; dirtyOmitted: number } | null;
}

export interface ReviewCommissionPayloadCell {
  renderer: string;
  pixelSha256: string | null;
  hostInstanceId: string | null;
  environmentId: string | null;
  build: ReviewCommissionPayloadSource['build'];
}

export function createReviewCommissionPayloadCell(cell: ReviewCommissionPayloadSource): ReviewCommissionPayloadCell {
  return {
    renderer: cell.renderer,
    pixelSha256: cell.referencePixelSha256,
    hostInstanceId: cell.provenance?.hostInstanceId ?? null,
    environmentId: cell.provenance?.environmentId ?? null,
    build: cell.build,
  };
}

export function createReferenceImageRequestTarget(
  entry: string,
  cell: ReviewCommissionPayloadCell & {
    pixelSha256: string;
    hostInstanceId: string;
    build: NonNullable<ReviewCommissionPayloadCell['build']> & { commit: string };
  },
  registeredEnvironmentId: string | null,
): {
  entry: string;
  renderer: string;
  pixelSha256: string;
  build: NonNullable<ReviewCommissionPayloadCell['build']> & { commit: string };
  capture: { hostInstanceId: string; environmentId: string | null };
} {
  return {
    entry,
    renderer: cell.renderer,
    pixelSha256: cell.pixelSha256,
    build: cell.build,
    capture: {
      hostInstanceId: cell.hostInstanceId,
      environmentId: registeredEnvironmentId,
    },
  };
}
