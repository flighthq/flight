import type { Path } from '@flighthq/types';
import { PathCommand } from '@flighthq/types';

import { flattenPath } from './flattenPath';

// Re-curves a polyline (or any flattened path) into smooth cubic bezier segments using
// Schneider's algorithm. The input path is first flattened, then partitioned at corners
// (points where the tangent direction changes by more than ~60°), and each span is fit with
// cubic beziers via least-squares. If the fit error exceeds `tolerance`, the span is split at
// the point of maximum error and each half is fit recursively. Alias-safe.
export function fitPathCurves(source: Readonly<Path>, tolerance: number, out: Path, flattenTolerance = 0.25): void {
  const contours = flattenPath(source, flattenTolerance);
  out.commands.length = 0;
  out.data.length = 0;
  out.winding = source.winding;

  const toleranceSq = tolerance * tolerance;
  for (const contour of contours) {
    const n = contour.length >> 1;
    if (n < 2) continue;

    const closed = n >= 3 && contour[0] === contour[contour.length - 2] && contour[1] === contour[contour.length - 1];
    const pts = closed ? contour.slice(0, (n - 1) * 2) : contour;
    const pn = pts.length >> 1;

    if (pn < 2) continue;
    if (pn === 2) {
      out.commands.push(PathCommand.MOVE_TO);
      out.data.push(pts[0], pts[1]);
      out.commands.push(PathCommand.LINE_TO);
      out.data.push(pts[2], pts[3]);
      if (closed) out.commands.push(PathCommand.CLOSE);
      continue;
    }

    const corners = findCorners(pts, pn);
    out.commands.push(PathCommand.MOVE_TO);
    out.data.push(pts[0], pts[1]);

    for (let ci = 0; ci < corners.length - 1; ci++) {
      const first = corners[ci];
      const last = corners[ci + 1];
      if (last - first < 2) {
        out.commands.push(PathCommand.LINE_TO);
        out.data.push(pts[last * 2], pts[last * 2 + 1]);
        continue;
      }
      const tHat1 = computeLeftTangent(pts, first);
      const tHat2 = computeRightTangent(pts, last);
      fitCubic(pts, first, last, tHat1, tHat2, toleranceSq, out);
    }

    if (closed) out.commands.push(PathCommand.CLOSE);
  }
}

function findCorners(pts: Readonly<number[]>, n: number): number[] {
  const corners = [0];
  for (let i = 1; i < n - 1; i++) {
    const dx0 = pts[i * 2] - pts[(i - 1) * 2];
    const dy0 = pts[i * 2 + 1] - pts[(i - 1) * 2 + 1];
    const dx1 = pts[(i + 1) * 2] - pts[i * 2];
    const dy1 = pts[(i + 1) * 2 + 1] - pts[i * 2 + 1];
    const len0 = Math.sqrt(dx0 * dx0 + dy0 * dy0);
    const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
    if (len0 === 0 || len1 === 0) continue;
    const dot = (dx0 * dx1 + dy0 * dy1) / (len0 * len1);
    if (dot < 0.5) corners.push(i);
  }
  corners.push(n - 1);
  return corners;
}

function computeLeftTangent(pts: Readonly<number[]>, idx: number): [number, number] {
  const dx = pts[(idx + 1) * 2] - pts[idx * 2];
  const dy = pts[(idx + 1) * 2 + 1] - pts[idx * 2 + 1];
  const len = Math.sqrt(dx * dx + dy * dy);
  return len > 0 ? [dx / len, dy / len] : [1, 0];
}

function computeRightTangent(pts: Readonly<number[]>, idx: number): [number, number] {
  const dx = pts[(idx - 1) * 2] - pts[idx * 2];
  const dy = pts[(idx - 1) * 2 + 1] - pts[idx * 2 + 1];
  const len = Math.sqrt(dx * dx + dy * dy);
  return len > 0 ? [dx / len, dy / len] : [-1, 0];
}

function chordLengthParameterize(pts: Readonly<number[]>, first: number, last: number): number[] {
  const u: number[] = [0];
  for (let i = first + 1; i <= last; i++) {
    const dx = pts[i * 2] - pts[(i - 1) * 2];
    const dy = pts[i * 2 + 1] - pts[(i - 1) * 2 + 1];
    u.push(u[u.length - 1] + Math.sqrt(dx * dx + dy * dy));
  }
  const total = u[u.length - 1];
  if (total > 0) {
    for (let i = 1; i < u.length; i++) u[i] /= total;
  }
  return u;
}

function fitCubic(
  pts: Readonly<number[]>,
  first: number,
  last: number,
  tHat1: [number, number],
  tHat2: [number, number],
  toleranceSq: number,
  out: Path,
): void {
  const nPts = last - first + 1;
  if (nPts === 2) {
    const dist = Math.sqrt((pts[last * 2] - pts[first * 2]) ** 2 + (pts[last * 2 + 1] - pts[first * 2 + 1]) ** 2);
    const d = dist / 3;
    out.commands.push(PathCommand.CUBIC_CURVE_TO);
    out.data.push(
      pts[first * 2] + tHat1[0] * d,
      pts[first * 2 + 1] + tHat1[1] * d,
      pts[last * 2] + tHat2[0] * d,
      pts[last * 2 + 1] + tHat2[1] * d,
      pts[last * 2],
      pts[last * 2 + 1],
    );
    return;
  }

  let u = chordLengthParameterize(pts, first, last);

  const MAX_ITERATIONS = 4;
  for (let iter = 0; iter <= MAX_ITERATIONS; iter++) {
    const bezier = generateBezier(pts, first, last, u, tHat1, tHat2);
    const [maxErr, splitPoint] = computeMaxError(pts, first, last, bezier, u);

    if (maxErr < toleranceSq) {
      out.commands.push(PathCommand.CUBIC_CURVE_TO);
      out.data.push(bezier[2], bezier[3], bezier[4], bezier[5], bezier[6], bezier[7]);
      return;
    }

    if (iter < MAX_ITERATIONS) {
      u = reparameterize(pts, first, last, u, bezier);
    } else {
      const tHatCenter = computeCenterTangent(pts, splitPoint);
      fitCubic(pts, first, splitPoint, tHat1, [-tHatCenter[0], -tHatCenter[1]], toleranceSq, out);
      fitCubic(pts, splitPoint, last, tHatCenter, tHat2, toleranceSq, out);
    }
  }
}

function generateBezier(
  pts: Readonly<number[]>,
  first: number,
  last: number,
  u: Readonly<number[]>,
  tHat1: [number, number],
  tHat2: [number, number],
): number[] {
  const nPts = last - first + 1;
  let c00 = 0;
  let c01 = 0;
  let c11 = 0;
  let x0 = 0;
  let x1 = 0;

  for (let i = 0; i < nPts; i++) {
    const t = u[i];
    const b1 = 3 * t * (1 - t) * (1 - t);
    const b2 = 3 * t * t * (1 - t);
    const a1x = tHat1[0] * b1;
    const a1y = tHat1[1] * b1;
    const a2x = tHat2[0] * b2;
    const a2y = tHat2[1] * b2;

    c00 += a1x * a1x + a1y * a1y;
    c01 += a1x * a2x + a1y * a2y;
    c11 += a2x * a2x + a2y * a2y;

    const b0 = (1 - t) * (1 - t) * (1 - t);
    const b3 = t * t * t;
    const tmpx =
      pts[(first + i) * 2] - (pts[first * 2] * b0 + pts[first * 2] * b1 + pts[last * 2] * b2 + pts[last * 2] * b3);
    const tmpy =
      pts[(first + i) * 2 + 1] -
      (pts[first * 2 + 1] * b0 + pts[first * 2 + 1] * b1 + pts[last * 2 + 1] * b2 + pts[last * 2 + 1] * b3);
    x0 += a1x * tmpx + a1y * tmpy;
    x1 += a2x * tmpx + a2y * tmpy;
  }

  const det = c00 * c11 - c01 * c01;
  let alpha1: number;
  let alpha2: number;

  if (Math.abs(det) < 1e-12) {
    const dist = Math.sqrt((pts[last * 2] - pts[first * 2]) ** 2 + (pts[last * 2 + 1] - pts[first * 2 + 1]) ** 2);
    alpha1 = alpha2 = dist / 3;
  } else {
    alpha1 = (c11 * x0 - c01 * x1) / det;
    alpha2 = (c00 * x1 - c01 * x0) / det;
  }

  const segLength = Math.sqrt((pts[last * 2] - pts[first * 2]) ** 2 + (pts[last * 2 + 1] - pts[first * 2 + 1]) ** 2);
  const epsilon = 1e-6 * segLength;

  if (alpha1 < epsilon || alpha2 < epsilon) {
    alpha1 = alpha2 = segLength / 3;
  }

  return [
    pts[first * 2],
    pts[first * 2 + 1],
    pts[first * 2] + tHat1[0] * alpha1,
    pts[first * 2 + 1] + tHat1[1] * alpha1,
    pts[last * 2] + tHat2[0] * alpha2,
    pts[last * 2 + 1] + tHat2[1] * alpha2,
    pts[last * 2],
    pts[last * 2 + 1],
  ];
}

function computeMaxError(
  pts: Readonly<number[]>,
  first: number,
  last: number,
  bezier: Readonly<number[]>,
  u: Readonly<number[]>,
): [number, number] {
  let maxDist = 0;
  let splitPoint = (last - first + 1) >> 1;

  for (let i = 1; i < last - first; i++) {
    const t = u[i];
    const mt = 1 - t;
    const bx =
      mt * mt * mt * bezier[0] + 3 * mt * mt * t * bezier[2] + 3 * mt * t * t * bezier[4] + t * t * t * bezier[6];
    const by =
      mt * mt * mt * bezier[1] + 3 * mt * mt * t * bezier[3] + 3 * mt * t * t * bezier[5] + t * t * t * bezier[7];
    const dx = pts[(first + i) * 2] - bx;
    const dy = pts[(first + i) * 2 + 1] - by;
    const distSq = dx * dx + dy * dy;
    if (distSq >= maxDist) {
      maxDist = distSq;
      splitPoint = first + i;
    }
  }

  return [maxDist, splitPoint];
}

function reparameterize(
  pts: Readonly<number[]>,
  first: number,
  last: number,
  u: Readonly<number[]>,
  bezier: Readonly<number[]>,
): number[] {
  const uPrime: number[] = [];
  for (let i = 0; i <= last - first; i++) {
    uPrime.push(newtonRaphsonRootFind(bezier, pts[(first + i) * 2], pts[(first + i) * 2 + 1], u[i]));
  }
  return uPrime;
}

function newtonRaphsonRootFind(bezier: Readonly<number[]>, px: number, py: number, u: number): number {
  const mt = 1 - u;
  const qx =
    mt * mt * mt * bezier[0] + 3 * mt * mt * u * bezier[2] + 3 * mt * u * u * bezier[4] + u * u * u * bezier[6];
  const qy =
    mt * mt * mt * bezier[1] + 3 * mt * mt * u * bezier[3] + 3 * mt * u * u * bezier[5] + u * u * u * bezier[7];

  const q1x =
    3 * mt * mt * (bezier[2] - bezier[0]) + 6 * mt * u * (bezier[4] - bezier[2]) + 3 * u * u * (bezier[6] - bezier[4]);
  const q1y =
    3 * mt * mt * (bezier[3] - bezier[1]) + 6 * mt * u * (bezier[5] - bezier[3]) + 3 * u * u * (bezier[7] - bezier[5]);

  const num = (qx - px) * q1x + (qy - py) * q1y;
  const q2x = 6 * mt * (bezier[4] - 2 * bezier[2] + bezier[0]) + 6 * u * (bezier[6] - 2 * bezier[4] + bezier[2]);
  const q2y = 6 * mt * (bezier[5] - 2 * bezier[3] + bezier[1]) + 6 * u * (bezier[7] - 2 * bezier[5] + bezier[3]);
  const den = q1x * q1x + q1y * q1y + (qx - px) * q2x + (qy - py) * q2y;

  if (Math.abs(den) < 1e-12) return u;
  return Math.max(0, Math.min(1, u - num / den));
}

function computeCenterTangent(pts: Readonly<number[]>, idx: number): [number, number] {
  const dx = pts[(idx - 1) * 2] - pts[(idx + 1) * 2];
  const dy = pts[(idx - 1) * 2 + 1] - pts[(idx + 1) * 2 + 1];
  const len = Math.sqrt(dx * dx + dy * dy);
  return len > 0 ? [dx / len, dy / len] : [1, 0];
}
