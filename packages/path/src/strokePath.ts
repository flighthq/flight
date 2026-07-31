import type { Path, StrokeStyle } from '@flighthq/types/contract';

import { appendPathClose, appendPathLineTo, appendPathMoveTo, createPath } from './path';
import { buildStrokePathGeometry } from './strokePathGeometry';

export type { StrokeStyle } from '@flighthq/types/contract';

// Converts a centerline Path into its fill outline using the same flatten/dash/offset/join/cap kernel
// as tessellateStrokePath. Open strokes emit one closed contour (left edge, end cap, reversed right
// edge, start cap). Closed strokes emit the two counter-wound boundary contours of the ring; consumers
// must honor non-zero winding for that case rather than independently filling both contours.
export function strokePath(path: Readonly<Path>, style: Readonly<StrokeStyle>, tolerance = 0.25): Path {
  const result = createPath('nonZero');
  const geometry = buildStrokePathGeometry(path, style, tolerance);
  for (let i = 0; i < geometry.pieces.length; i++) appendPieceOutline(result, geometry.pieces[i]);
  return result;
}

function appendPieceOutline(
  path: Path,
  piece: Readonly<{
    closed: boolean;
    endCap: readonly number[];
    left: readonly number[];
    right: readonly number[];
    startCap: readonly number[];
  }>,
): void {
  if (piece.left.length < 4 || piece.right.length < 4) return;
  appendContour(
    path,
    piece.left,
    false,
    piece.closed ? EMPTY_POINTS : piece.endCap,
    piece.closed ? EMPTY_POINTS : piece.startCap,
    piece.right,
  );
  if (piece.closed) appendContour(path, piece.right, true, EMPTY_POINTS, EMPTY_POINTS, EMPTY_POINTS);
}

function appendContour(
  path: Path,
  primary: readonly number[],
  reversePrimary: boolean,
  afterPrimary: readonly number[],
  afterSecondary: readonly number[],
  secondary: readonly number[],
): void {
  if (reversePrimary) {
    appendPathMoveTo(path, primary[primary.length - 2], primary[primary.length - 1]);
    for (let i = primary.length - 4; i >= 0; i -= 2) appendPathLineTo(path, primary[i], primary[i + 1]);
  } else {
    appendPathMoveTo(path, primary[0], primary[1]);
    appendPoints(path, primary, 2, 2);
  }
  appendPoints(path, afterPrimary, 0, 2);
  appendPoints(path, secondary, secondary.length - 2, -2);
  appendPoints(path, afterSecondary, 0, 2);
  appendPathClose(path);
}

function appendPoints(path: Path, points: readonly number[], start: number, step: number): void {
  for (let i = start; i >= 0 && i < points.length; i += step) appendPathLineTo(path, points[i], points[i + 1]);
}

const EMPTY_POINTS: readonly number[] = [];
