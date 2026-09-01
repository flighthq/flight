import { getRectangleMaxX, getRectangleMaxY, getRectangleMinX, getRectangleMinY } from '@flighthq/geometry/contract';
import type { GizmoAlignment, GizmoSmartGuideResult, RectangleLike } from '@flighthq/types/contract';

/**
 * Writes interleaved world- or local-space translation deltas for aligning a selection to its
 * combined bounds. Every rectangle must already be expressed in the same coordinate space.
 */
export function computeGizmoAlignmentDeltas(
  out: number[],
  bounds: readonly Readonly<RectangleLike>[],
  alignment: GizmoAlignment,
): void {
  out.length = bounds.length * 2;
  if (bounds.length === 0) return;

  const horizontal = alignment === 'horizontal-center' || alignment === 'left' || alignment === 'right';
  let minimum = Infinity;
  let maximum = -Infinity;
  for (let i = 0; i < bounds.length; i++) {
    const source = bounds[i];
    const start = horizontal ? getRectangleMinX(source) : getRectangleMinY(source);
    const end = horizontal ? getRectangleMaxX(source) : getRectangleMaxY(source);
    minimum = Math.min(minimum, start);
    maximum = Math.max(maximum, end);
  }

  const target =
    alignment === 'left' || alignment === 'top'
      ? minimum
      : alignment === 'right' || alignment === 'bottom'
        ? maximum
        : (minimum + maximum) * 0.5;
  for (let i = 0; i < bounds.length; i++) {
    const source = bounds[i];
    const start = horizontal ? getRectangleMinX(source) : getRectangleMinY(source);
    const end = horizontal ? getRectangleMaxX(source) : getRectangleMaxY(source);
    const anchor =
      alignment === 'left' || alignment === 'top'
        ? start
        : alignment === 'right' || alignment === 'bottom'
          ? end
          : (start + end) * 0.5;
    out[i * 2] = horizontal ? target - anchor : 0;
    out[i * 2 + 1] = horizontal ? 0 : target - anchor;
  }
}

/**
 * Finds at most one vertical and one horizontal edge/center guide for a moving rectangle. Equal
 * distances keep the earliest candidate, then the start/center/end anchor order, so repeated calls
 * with the same ordered input are deterministic. All rectangles and `threshold` share one space.
 */
export function findGizmoSmartGuides(
  out: GizmoSmartGuideResult,
  movingBounds: Readonly<RectangleLike>,
  candidateBounds: readonly Readonly<RectangleLike>[],
  threshold: number,
): boolean {
  out.deltaX = 0;
  out.deltaY = 0;
  out.guideX = null;
  out.guideY = null;
  if (threshold < 0 || !Number.isFinite(threshold)) return false;

  const foundX = findGizmoSmartGuideAxis(
    out,
    getRectangleMinX(movingBounds),
    getRectangleMaxX(movingBounds),
    candidateBounds,
    threshold,
    true,
  );
  const foundY = findGizmoSmartGuideAxis(
    out,
    getRectangleMinY(movingBounds),
    getRectangleMaxY(movingBounds),
    candidateBounds,
    threshold,
    false,
  );
  return foundX || foundY;
}

function findGizmoSmartGuideAxis(
  out: GizmoSmartGuideResult,
  movingStart: number,
  movingEnd: number,
  candidateBounds: readonly Readonly<RectangleLike>[],
  threshold: number,
  horizontal: boolean,
): boolean {
  const movingCenter = (movingStart + movingEnd) * 0.5;
  let bestDistance = Infinity;
  let bestDelta = 0;
  let bestGuide = 0;
  for (let candidateIndex = 0; candidateIndex < candidateBounds.length; candidateIndex++) {
    const candidate = candidateBounds[candidateIndex];
    const candidateStart = horizontal ? getRectangleMinX(candidate) : getRectangleMinY(candidate);
    const candidateEnd = horizontal ? getRectangleMaxX(candidate) : getRectangleMaxY(candidate);
    const candidateCenter = (candidateStart + candidateEnd) * 0.5;
    for (let candidateAnchor = 0; candidateAnchor < 3; candidateAnchor++) {
      const guide = candidateAnchor === 0 ? candidateStart : candidateAnchor === 1 ? candidateCenter : candidateEnd;
      for (let movingAnchor = 0; movingAnchor < 3; movingAnchor++) {
        const source = movingAnchor === 0 ? movingStart : movingAnchor === 1 ? movingCenter : movingEnd;
        const delta = guide - source;
        const distance = Math.abs(delta);
        if (distance > threshold || distance >= bestDistance) continue;
        bestDistance = distance;
        bestDelta = delta;
        bestGuide = guide;
      }
    }
  }
  if (bestDistance === Infinity) return false;
  if (horizontal) {
    out.deltaX = bestDelta;
    out.guideX = bestGuide;
  } else {
    out.deltaY = bestDelta;
    out.guideY = bestGuide;
  }
  return true;
}
