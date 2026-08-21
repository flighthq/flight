import type { ReviewCommissionState } from './commissionState';

export interface ReviewReferenceHashCell {
  /** Capture-baseline identity from status.json. */
  hash: string | null;
  /** Decoded top-down RGBA identity shared with reference-image locks and requests. */
  referencePixelSha256: string | null;
}

/**
 * Whether an open request still describes what this capture renders.
 *
 * ★ A REQUEST IS A PIN, AND A PIN CAN GO STALE. The review tool treated any open request as "pending" and
 * disabled the Commission button, so a scene that changed after being commissioned could not be
 * re-commissioned — the tool refused the one action that would have fixed it, and the request went on to
 * bless a picture the tree no longer produces. Comparing the pinned hash to the capture separates a
 * decision still in flight from one the tree has overtaken.
 *
 * An undecodable capture (`capturedPixelSha256 === null`) counts as STILL PENDING rather than stale: we
 * cannot show that the pin is wrong, and enabling a commission whose pixels we could not read would
 * replace a good pin with nothing.
 */
export function isReviewRequestStillPending(
  pinnedPixelSha256: string | undefined,
  capturedPixelSha256: string | null,
): boolean {
  if (pinnedPixelSha256 === undefined) return false;
  if (capturedPixelSha256 === null) return true;
  return pinnedPixelSha256 === capturedPixelSha256;
}

export function resolveReferenceImageCommissionState(
  cell: ReviewReferenceHashCell,
  lockedPixelSha256: string | undefined,
  requested: boolean,
  /** Shared comparator verdict. When present it is authoritative over the exact-hash legacy path. */
  comparisonMatches?: boolean | null,
): ReviewCommissionState {
  if (requested) return 'requested';
  if (lockedPixelSha256 !== undefined) {
    if (comparisonMatches !== undefined && comparisonMatches !== null) {
      return comparisonMatches ? 'included' : 'differs';
    }
    return cell.referencePixelSha256 !== null && cell.referencePixelSha256 === lockedPixelSha256
      ? 'included'
      : 'differs';
  }
  return 'not-commissioned';
}

export interface ReviewCommissionStateTest {
  tool: string;
  name: string;
  cells: { renderer: string; commissionState: ReviewCommissionState | null }[];
}

/** Applies a request event without replacing the page, selection, or scroll context. Idempotent. */
export function markReviewCommissionRequested(
  tests: readonly ReviewCommissionStateTest[],
  requestedCells: readonly string[],
): number {
  const requested = new Set(requestedCells);
  let changed = 0;
  for (const test of tests) {
    for (const cell of test.cells) {
      if (!requested.has(`${test.tool}/${test.name}/${cell.renderer}`) || cell.commissionState === null) continue;
      if (cell.commissionState !== 'requested') {
        cell.commissionState = 'requested';
        changed++;
      }
    }
  }
  return changed;
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
