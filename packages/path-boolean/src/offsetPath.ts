// Generated from crates/flight-path-boolean/src/offset_path.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { flattenPath } from '@flighthq/path/contract';
import type { Path } from '@flighthq/path/contract';

import type { PathBooleanKernelRaw } from './martinezKernel.ts';
import type { PathOffsetEnd, PathOffsetJoin, PathOffsetOptions } from './pathBoolean.ts';
import { resolvePathRegions } from './resolvePathRegions.ts';

const DEFAULT_ARC_TOLERANCE: number = 0.25;

const DEFAULT_MITER_LIMIT: number = 2.0;

const DEFAULT_FLATTEN_TOLERANCE: number = 0.25;

const HALF_PI: number = Math.PI / 2.0;

const POINT_EPS: number = 1e-9;

const POINT_EPS_RELATIVE: number = 1e-9;

const PARALLEL_EPS: number = 1e-12;

const TWO_PI: number = Math.PI * 2.0;

function buildOffsetRing(
  vertices: Readonly<number[]>,
  signedDelta: number,
  capIndices: Readonly<number[]>,
  join: PathOffsetJoin,
  end: PathOffsetEnd,
  miterLimit: number,
  arcTolerance: number,
): number[] {
  const count = Math.trunc(vertices.length / 2);
  let dirX: number[] = new Array(count).fill(0.0);
  let dirY: number[] = new Array(count).fill(0.0);
  let normalX: number[] = new Array(count).fill(0.0);
  let normalY: number[] = new Array(count).fill(0.0);
  for (let k = 0; k < count; k += 1) {
    const kn = (k + 1) % count;
    const dx = vertices[2 * kn] - vertices[2 * k];
    const dy = vertices[2 * kn + 1] - vertices[2 * k + 1];
    const length = Math.sqrt(dx * dx + dy * dy);
    const inverse = length > 0.0 ? 1.0 / length : 0.0;
    dirX[k] = dx * inverse;
    dirY[k] = dy * inverse;
    normalX[k] = dirY[k];
    normalY[k] = -dirX[k];
  }
  let ring: number[] = [] as never[];
  for (let k = 0; k < count; k += 1) {
    const previous = (k + count - 1) % count;
    const vx = vertices[2 * k];
    const vy = vertices[2 * k + 1];
    const previousEndX = vx + signedDelta * normalX[previous];
    const previousEndY = vy + signedDelta * normalY[previous];
    const thisStartX = vx + signedDelta * normalX[k];
    const thisStartY = vy + signedDelta * normalY[k];
    if (capIndices.includes(k)) {
      emitOffsetEndCap(
        ring,
        vx,
        vy,
        previousEndX,
        previousEndY,
        thisStartX,
        thisStartY,
        dirX[previous],
        dirY[previous],
        dirX[k],
        dirY[k],
        Math.abs(signedDelta),
        end,
        arcTolerance,
      );
    } else {
      emitOffsetJoin(
        ring,
        vx,
        vy,
        previousEndX,
        previousEndY,
        thisStartX,
        thisStartY,
        dirX[previous],
        dirY[previous],
        dirX[k],
        dirY[k],
        signedDelta,
        join,
        miterLimit,
        arcTolerance,
      );
    }
  }
  return ring;
}

function emitOffsetEndCap(
  ring: number[],
  vx: number,
  vy: number,
  previousEndX: number,
  previousEndY: number,
  thisStartX: number,
  thisStartY: number,
  previousDirX: number,
  previousDirY: number,
  thisDirX: number,
  thisDirY: number,
  radius: number,
  end: PathOffsetEnd,
  arcTolerance: number,
): void {
  ring.push(previousEndX);
  ring.push(previousEndY);
  switch (end) {
    case 'square':
      ring.push(previousEndX + radius * previousDirX);
      ring.push(previousEndY + radius * previousDirY);
      ring.push(thisStartX - radius * thisDirX);
      ring.push(thisStartY - radius * thisDirY);
      break;
    case 'round':
      const startAngle = Math.atan2(previousEndY - vy, previousEndX - vx);
      const midX = Math.cos(startAngle + HALF_PI);
      const midY = Math.sin(startAngle + HALF_PI);
      const sweep = (midX * previousDirX + midY * previousDirY >= 0.0 ? 1.0 : -1.0) * Math.PI;
      pushOffsetArc(ring, vx, vy, radius, startAngle, sweep, arcTolerance);
      break;
    case 'butt':
      break;
  }
  ring.push(thisStartX);
  ring.push(thisStartY);
}

function emitOffsetJoin(
  ring: number[],
  vx: number,
  vy: number,
  previousEndX: number,
  previousEndY: number,
  thisStartX: number,
  thisStartY: number,
  previousDirX: number,
  previousDirY: number,
  thisDirX: number,
  thisDirY: number,
  signedDelta: number,
  join: PathOffsetJoin,
  miterLimit: number,
  arcTolerance: number,
): void {
  ring.push(previousEndX);
  ring.push(previousEndY);
  const turn = previousDirX * thisDirY - previousDirY * thisDirX;
  const convex = turn * signedDelta > 0.0;
  if (!convex) {
    if (Math.abs(turn) > PARALLEL_EPS) {
      const advance = ((thisStartX - previousEndX) * thisDirY - (thisStartY - previousEndY) * thisDirX) / turn;
      ring.push(previousEndX + advance * previousDirX);
      ring.push(previousEndY + advance * previousDirY);
    }
  } else {
    switch (join) {
      case 'miter':
        if (Math.abs(turn) > PARALLEL_EPS) {
          const advance = ((thisStartX - previousEndX) * thisDirY - (thisStartY - previousEndY) * thisDirX) / turn;
          const apexX = previousEndX + advance * previousDirX;
          const apexY = previousEndY + advance * previousDirY;
          const miterLength = Math.sqrt((apexX - vx) * (apexX - vx) + (apexY - vy) * (apexY - vy));
          if (miterLength <= miterLimit * Math.abs(signedDelta)) {
            ring.push(apexX);
            ring.push(apexY);
          }
        }
        break;
      case 'square':
        const squareExtent = Math.abs(signedDelta);
        ring.push(previousEndX + squareExtent * previousDirX);
        ring.push(previousEndY + squareExtent * previousDirY);
        ring.push(thisStartX - squareExtent * thisDirX);
        ring.push(thisStartY - squareExtent * thisDirY);
        break;
      case 'round':
        const radius = Math.abs(signedDelta);
        const startAngle = Math.atan2(previousEndY - vy, previousEndX - vx);
        const endAngle = Math.atan2(thisStartY - vy, thisStartX - vx);
        pushOffsetArc(ring, vx, vy, radius, startAngle, getShortSweep(startAngle, endAngle), arcTolerance);
        break;
      case 'bevel':
        break;
    }
  }
  ring.push(thisStartX);
  ring.push(thisStartY);
}

function getCleanContourVertices(contour: Readonly<number[]>, closed: boolean, pointEpsSq: number): number[] {
  let out: number[] = [] as never[];
  let i = 0;
  while (i < contour.length) {
    const x = contour[i];
    const y = contour[i + 1];
    if (out.length >= 2) {
      const dx = x - out[out.length - 2];
      const dy = y - out[out.length - 1];
      if (dx * dx + dy * dy <= pointEpsSq) {
        i += 2;
        continue;
      }
    }
    out.push(x);
    out.push(y);
    i += 2;
  }
  if (closed && out.length >= 4) {
    const dx = out[0] - out[out.length - 2];
    const dy = out[1] - out[out.length - 1];
    if (dx * dx + dy * dy <= pointEpsSq) {
      out = [...out.slice(0, out.length - 2)];
    }
  }
  return out;
}

function getContourPointEps(contours: Readonly<number[][]>): number {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const contour of contours) {
    let i = 0;
    while (i < contour.length) {
      const x = contour[i];
      const y = contour[i + 1];
      if (x < minX) {
        minX = x;
      }
      if (x > maxX) {
        maxX = x;
      }
      if (y < minY) {
        minY = y;
      }
      if (y > maxY) {
        maxY = y;
      }
      i += 2;
    }
  }
  const extent = Math.max(maxX - minX, maxY - minY);
  return extent > 0.0 ? extent * POINT_EPS_RELATIVE : POINT_EPS;
}

function getOpenContourLoop(vertices: Readonly<number[]>): number[] {
  const count = Math.trunc(vertices.length / 2);
  let result = [...vertices];
  let k = count - 2;
  while (k >= 1) {
    result.push(vertices[2 * (k >>> 0)]);
    result.push(vertices[2 * (k >>> 0) + 1]);
    k -= 1;
  }
  return result;
}

function getRingOrientationSign(vertices: Readonly<number[]>): number {
  const sign = getRingSignedArea(vertices);
  if (sign > 0.0) {
    return 1;
  }
  if (sign < 0.0) {
    return -1;
  }
  return 1;
}

function getRingSignedArea(vertices: Readonly<number[]>): number {
  let area: number = 0.0;
  const count = Math.trunc(vertices.length / 2);
  for (let k = 0; k < count; k += 1) {
    const kn = (k + 1) % count;
    area += vertices[2 * k] * vertices[2 * kn + 1] - vertices[2 * kn] * vertices[2 * k + 1];
  }
  return area * 0.5;
}

function getShortSweep(startAngle: number, endAngle: number): number {
  let sweep = endAngle - startAngle;
  while (sweep <= -Math.PI) {
    sweep += TWO_PI;
  }
  while (sweep > Math.PI) {
    sweep -= TWO_PI;
  }
  return sweep;
}

function isClosedContour(contour: Readonly<number[]>, pointEpsSq: number): boolean {
  const n = contour.length;
  if (n < 6) {
    return false;
  }
  const dx = contour[0] - contour[n - 2];
  const dy = contour[1] - contour[n - 1];
  return dx * dx + dy * dy <= pointEpsSq;
}

/**
 * Offsets a path outward (positive `delta`, inflate) or inward (negative `delta`,
 * deflate) by a signed distance. The input is flattened to polygon contours;
 * closed contours are offset into grown/shrunk rings and open contours are offset
 * into closed slab outlines with end caps. Corner style is controlled by
 * `options.join`; open-path terminals by `options.end`. The raw offset rings are
 * then self-unioned under positive fill to resolve self-overlap, merge touching
 * rings, and emit a clean, hole-correct outline.
 *
 * Alias-safe: the input path is fully captured (flattened) before any write to `out`.
 */
export function offsetPath(
  out: Path,
  pathBooleanKernel: Readonly<PathBooleanKernelRaw>,
  path: Readonly<Path>,
  delta: number,
  options?: Readonly<PathOffsetOptions>,
): void {
  const join = options?.join ?? 'miter';
  const end = options?.end ?? 'butt';
  const miterLimit = options?.miterLimit ?? DEFAULT_MITER_LIMIT;
  const arcTolerance = options?.arcTolerance ?? DEFAULT_ARC_TOLERANCE;
  const tolerance = options?.tolerance ?? DEFAULT_FLATTEN_TOLERANCE;
  const contours = flattenPath(path, tolerance);
  const pointEpsSq = Math.pow(getContourPointEps(contours), 2);
  let rawRings: number[][] = [] as never[];
  for (const contour of contours) {
    const closed = isClosedContour(contour, pointEpsSq);
    const vertices = getCleanContourVertices(contour, closed, pointEpsSq);
    if (closed) {
      if (vertices.length < 6) {
        continue;
      }
      const orientation = getRingOrientationSign(vertices);
      const noCaps: number[] = [] as never[];
      const ring = buildOffsetRing(vertices, delta * orientation, noCaps, join, end, miterLimit, arcTolerance);
      if (ring.length < 6) {
        continue;
      }
      const offsetArea = getRingSignedArea(ring);
      const inverted = (Math.sign(offsetArea) | 0) !== orientation;
      const notReduced = delta < 0.0 && Math.abs(offsetArea) >= Math.abs(getRingSignedArea(vertices));
      if (inverted || notReduced) {
        continue;
      }
      if (offsetArea < 0.0) {
        rawRings.push(reverseVertexLoop(ring));
      } else {
        rawRings.push(ring);
      }
    } else {
      if (vertices.length < 4) {
        continue;
      }
      const count = Math.trunc(vertices.length / 2);
      const caps: number[] = [0, count - 1];
      const loopVerts = getOpenContourLoop(vertices);
      const ring = buildOffsetRing(loopVerts, Math.abs(delta), caps, join, end, miterLimit, arcTolerance);
      if (ring.length >= 6) {
        if (getRingSignedArea(ring) < 0.0) {
          rawRings.push(reverseVertexLoop(ring));
        } else {
          rawRings.push(ring);
        }
      }
    }
  }
  resolvePathRegions(out, pathBooleanKernel, rawRings, 'positive');
}

function pushOffsetArc(
  ring: number[],
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  sweep: number,
  arcTolerance: number,
): void {
  const maxAngle = arcTolerance > 0.0 && arcTolerance < radius ? 2.0 * Math.acos(1.0 - arcTolerance / radius) : Math.PI;
  const steps = Math.max(1, Math.ceil(Math.abs(sweep) / maxAngle) >>> 0);
  for (let i = 1; i < steps; i += 1) {
    const angle = startAngle + sweep * (i / steps);
    ring.push(cx + radius * Math.cos(angle));
    ring.push(cy + radius * Math.sin(angle));
  }
}

function reverseVertexLoop(vertices: Readonly<number[]>): number[] {
  const count = Math.trunc(vertices.length / 2);
  let out = new Array(vertices.length).fill(0.0);
  out[0] = vertices[0];
  out[1] = vertices[1];
  for (let k = 1; k < count; k += 1) {
    const source = count - k;
    out[2 * k] = vertices[2 * source];
    out[2 * k + 1] = vertices[2 * source + 1];
  }
  return out;
}
