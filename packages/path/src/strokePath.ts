// Generated from crates/flight-path/src/stroke_path.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { PathRaw, StrokeStyle } from './path.ts';
import { appendPathClose, appendPathLineTo, appendPathMoveTo, createPath } from './path.ts';
import type { StrokePathPieceGeometry } from './strokePathGeometry.ts';
import { buildStrokePathGeometry } from './strokePathGeometry.ts';

function appendContour(
  path: PathRaw,
  primary: Readonly<number[]>,
  reversePrimary: boolean,
  afterPrimary: Readonly<number[]>,
  afterSecondary: Readonly<number[]>,
  secondary: Readonly<number[]>,
): void {
  if (reversePrimary) {
    appendPathMoveTo(path, primary[primary.length - 2], primary[primary.length - 1]);
    let i = (primary.length | 0) - 4;
    while (i >= 0) {
      appendPathLineTo(path, primary[i >>> 0], primary[(i >>> 0) + 1]);
      i -= 2;
    }
  } else {
    appendPathMoveTo(path, primary[0], primary[1]);
    appendPoints(path, primary, 2, 2);
  }
  appendPoints(path, afterPrimary, 0, 2);
  if (secondary.length >= 2) {
    appendPointsReverse(path, secondary);
  }
  appendPoints(path, afterSecondary, 0, 2);
  appendPathClose(path);
}

function appendPieceOutline(path: PathRaw, piece: Readonly<StrokePathPieceGeometry>): void {
  if (piece.left.length < 4 || piece.right.length < 4) {
    return;
  }
  const empty: number[] = [] as never[];
  appendContour(
    path,
    piece.left,
    false,
    piece.closed ? empty : piece.endCap,
    piece.closed ? empty : piece.startCap,
    piece.right,
  );
  if (piece.closed) {
    appendContour(path, piece.right, true, empty, empty, empty);
  }
}

function appendPoints(path: PathRaw, points: Readonly<number[]>, start: number, step: number): void {
  let i = start;
  while (i < points.length) {
    appendPathLineTo(path, points[i], points[i + 1]);
    i += step;
  }
}

function appendPointsReverse(path: PathRaw, points: Readonly<number[]>): void {
  let i = (points.length | 0) - 2;
  while (i >= 0) {
    appendPathLineTo(path, points[i >>> 0], points[(i >>> 0) + 1]);
    i -= 2;
  }
}

/**
 * Converts a centerline Path into its fill outline.
 */
export function strokePath(path: Readonly<PathRaw>, style: Readonly<StrokeStyle>, tolerance?: number): PathRaw {
  tolerance = tolerance ?? 0.25;
  let result = createPath('nonZero');
  const geometry = buildStrokePathGeometry(path, style, tolerance);
  for (let i = 0; i < geometry.pieces.length; i += 1) {
    appendPieceOutline(result, geometry.pieces[i]);
  }
  return result;
}
