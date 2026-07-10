import { flattenPath } from '@flighthq/path';
import type { Path, PathOffsetEnd, PathOffsetJoin, PathOffsetOptions } from '@flighthq/types';

import { resolvePathRegions } from './resolvePathRegions';

// Offsets a path outward (positive `delta`, inflate) or inward (negative `delta`, deflate) by a signed
// distance, returning a fresh polygon-outline `Path`. The input is flattened to polygon contours at the
// option tolerance; each closed contour is offset into a grown/shrunk ring and each open contour is
// offset into a closed slab outline capped at both terminals. Corner style on the convex side of a
// vertex is chosen by `options.join` (miter/bevel/round/square); open-path terminals by `options.end`
// (butt/round/square). The raw offset rings are then self-unioned by the active boolean kernel under
// non-zero fill to resolve the self-overlap concave corners produce, merge touching rings, and emit a
// clean, hole-correct outline. `delta` is signed against a canonical orientation, so positive always
// grows regardless of input winding. Over-deflating a region past self-collapse drops it, so the result
// can be an empty path (no commands).
export function offsetPath(path: Readonly<Path>, delta: number, options?: Readonly<PathOffsetOptions>): Path {
  const join = options?.join ?? 'miter';
  const end = options?.end ?? 'butt';
  const miterLimit = options?.miterLimit ?? DEFAULT_MITER_LIMIT;
  const arcTolerance = options?.arcTolerance ?? DEFAULT_ARC_TOLERANCE;
  const contours = flattenPath(path, options?.tolerance);
  // Coincident-point tolerance, made relative to the input's coordinate extent so the same corners
  // collapse whether the contour is in pixels or micrometres; falls back to a fixed absolute when the
  // extent is degenerate. Squared to match the squared-distance comparisons it feeds.
  const pointEpsSq = getContourPointEps(contours) ** 2;

  const rawRings: number[][] = [];
  for (const contour of contours) {
    const closed = isClosedContour(contour, pointEpsSq);
    const vertices = getCleanContourVertices(contour, closed, pointEpsSq);
    if (closed) {
      // Fewer than three distinct vertices enclose no area to offset.
      if (vertices.length < 6) continue;
      const orientation = getRingOrientationSign(vertices);
      const ring = buildOffsetRing(vertices, delta * orientation, NO_CAPS, join, end, miterLimit, arcTolerance);
      if (ring.length < 6) continue;
      // Drop a ring deflated past self-collapse. Such a ring either fully inverts (its winding flips) or
      // folds back so an inward offset fails to reduce the enclosed area — the global signature of a full
      // collapse. (Partial self-overlap that stays same-signed is left for the positive-fill union below.)
      const offsetArea = getRingSignedArea(ring);
      const inverted = Math.sign(offsetArea) !== orientation;
      const notReduced = delta < 0 && Math.abs(offsetArea) >= Math.abs(getRingSignedArea(vertices));
      if (inverted || notReduced) continue;
      // Orient the surviving ring counter-clockwise (positive area) so the positive-fill self-union keeps
      // it whatever the source winding was.
      rawRings.push(offsetArea < 0 ? reverseVertexLoop(ring) : ring);
    } else {
      // Fewer than two distinct vertices form no segment to stroke.
      if (vertices.length < 4) continue;
      const caps = new Set<number>([0, vertices.length / 2 - 1]);
      const loop = getOpenContourLoop(vertices);
      const ring = buildOffsetRing(loop, Math.abs(delta), caps, join, end, miterLimit, arcTolerance);
      // A stroked slab always bounds a positive-area band; orient it counter-clockwise so positive-fill
      // union keeps it regardless of which way the doubled loop happened to wind.
      if (ring.length >= 6) rawRings.push(getRingSignedArea(ring) < 0 ? reverseVertexLoop(ring) : ring);
    }
  }

  // Self-union the raw rings under positive fill (Clipper's InflatePaths cleanup fill): where a concave
  // corner's inner-miter emission overshoots on a feature narrower than 2·|delta|, it dissolves the
  // negatively-wound self-overlap that non-zero fill would have kept; it also merges touching rings and
  // emits a clean, hole-correct outline (empty ring set → empty path).
  return resolvePathRegions(rawRings, 'positive');
}

// Assembles one offset ring for a closed vertex loop by walking its vertices and emitting, at each, the
// join (or end cap, for the flagged terminal indices of an open-path loop) that bridges the offset end
// of the previous edge to the offset start of the next. `signedDelta` is the outward offset distance;
// the outward direction is the per-edge right normal, so a positively-oriented loop grows on positive
// `signedDelta`. `capIndices` is empty for a genuine closed contour and holds the two terminal indices
// for an open contour's doubled loop.
function buildOffsetRing(
  vertices: readonly number[],
  signedDelta: number,
  capIndices: ReadonlySet<number>,
  join: PathOffsetJoin,
  end: PathOffsetEnd,
  miterLimit: number,
  arcTolerance: number,
): number[] {
  const count = vertices.length / 2;
  // Per-edge unit direction and right normal; edge k runs from vertex k to vertex (k + 1) mod count.
  const dirX = new Array<number>(count);
  const dirY = new Array<number>(count);
  const normalX = new Array<number>(count);
  const normalY = new Array<number>(count);
  for (let k = 0; k < count; k++) {
    const kn = (k + 1) % count;
    const dx = vertices[2 * kn] - vertices[2 * k];
    const dy = vertices[2 * kn + 1] - vertices[2 * k + 1];
    const length = Math.hypot(dx, dy);
    const inverse = length > 0 ? 1 / length : 0;
    dirX[k] = dx * inverse;
    dirY[k] = dy * inverse;
    normalX[k] = dirY[k];
    normalY[k] = -dirX[k];
  }

  const ring: number[] = [];
  for (let k = 0; k < count; k++) {
    const previous = (k - 1 + count) % count;
    const vx = vertices[2 * k];
    const vy = vertices[2 * k + 1];
    const previousEndX = vx + signedDelta * normalX[previous];
    const previousEndY = vy + signedDelta * normalY[previous];
    const thisStartX = vx + signedDelta * normalX[k];
    const thisStartY = vy + signedDelta * normalY[k];
    if (capIndices.has(k)) {
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

// Emits the terminal cap of an open path at vertex (vx, vy), bridging the offset end of the incoming
// side (previousEnd) to the offset start of the outgoing side (thisStart), which sit on opposite sides
// of the terminal. `butt` connects them flat, `square` extends both out past the terminal by `radius`,
// and `round` sweeps a half-circle of that radius around the terminal. `previousEnd` is emitted first;
// `thisStart` is always emitted last.
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
  ring.push(previousEndX, previousEndY);
  if (end === 'square') {
    ring.push(previousEndX + radius * previousDirX, previousEndY + radius * previousDirY);
    ring.push(thisStartX - radius * thisDirX, thisStartY - radius * thisDirY);
  } else if (end === 'round') {
    const startAngle = Math.atan2(previousEndY - vy, previousEndX - vx);
    // Sweep the half-circle that bulges past the terminal — the side the incoming direction points.
    const midX = Math.cos(startAngle + HALF_PI);
    const midY = Math.sin(startAngle + HALF_PI);
    const sweep = (midX * previousDirX + midY * previousDirY >= 0 ? 1 : -1) * Math.PI;
    pushOffsetArc(ring, vx, vy, radius, startAngle, sweep, arcTolerance);
  }
  ring.push(thisStartX, thisStartY);
}

// Emits the join at vertex (vx, vy) on the convex (gap) side, bridging the offset end of the previous
// edge (previousEnd) to the offset start of the next edge (thisStart). On the concave side the two
// offset edges overlap; the outline routes back through the original vertex (previousEnd → vertex →
// thisStart), leaving a self-crossing spur with consistent winding for the kernel's self-union to
// resolve. `miter` extends the two offset edges to their apex, falling back to a bevel
// when that apex is farther than `miterLimit * |signedDelta|`; `bevel` chamfers straight across;
// `round` sweeps an arc of radius `|signedDelta|`; `square` extends both edges by `|signedDelta|`.
// `previousEnd` is emitted first; `thisStart` is always emitted last.
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
  ring.push(previousEndX, previousEndY);
  const turn = previousDirX * thisDirY - previousDirY * thisDirX;
  const convex = turn * signedDelta > 0;
  if (!convex) {
    // Inner (overlap) corner: emit where the two offset edge lines cross — the inner miter point. For a
    // mild corner this is the correct clean vertex; for a feature narrower than 2·|delta| it overshoots
    // past the offset edges, and the resulting self-crossing spur is dissolved by the positive-fill
    // self-union, which drops the negatively-wound overshoot region. Positive fill is what makes this
    // robust where non-zero fill (which keeps the overshoot) could not.
    if (Math.abs(turn) > PARALLEL_EPS) {
      const advance = ((thisStartX - previousEndX) * thisDirY - (thisStartY - previousEndY) * thisDirX) / turn;
      ring.push(previousEndX + advance * previousDirX, previousEndY + advance * previousDirY);
    }
  } else {
    if (join === 'miter') {
      // Intersect the two offset edge lines; the apex is where the extended normals meet.
      if (Math.abs(turn) > PARALLEL_EPS) {
        const advance = ((thisStartX - previousEndX) * thisDirY - (thisStartY - previousEndY) * thisDirX) / turn;
        const apexX = previousEndX + advance * previousDirX;
        const apexY = previousEndY + advance * previousDirY;
        const miterLength = Math.hypot(apexX - vx, apexY - vy);
        if (miterLength <= miterLimit * Math.abs(signedDelta)) ring.push(apexX, apexY);
      }
    } else if (join === 'square') {
      const radius = Math.abs(signedDelta);
      ring.push(previousEndX + radius * previousDirX, previousEndY + radius * previousDirY);
      ring.push(thisStartX - radius * thisDirX, thisStartY - radius * thisDirY);
    } else if (join === 'round') {
      const radius = Math.abs(signedDelta);
      const startAngle = Math.atan2(previousEndY - vy, previousEndX - vx);
      const endAngle = Math.atan2(thisStartY - vy, thisStartX - vx);
      pushOffsetArc(ring, vx, vy, radius, startAngle, getShortSweep(startAngle, endAngle), arcTolerance);
    }
    // A bevel adds nothing between previousEnd and thisStart — the straight edge is the chamfer.
  }
  ring.push(thisStartX, thisStartY);
}

// Removes consecutive coincident points from a flattened contour and, for a closed contour, the closing
// vertex that repeats the first, yielding a clean `[x0, y0, ...]` vertex loop with no zero-length edges.
// `pointEpsSq` is the squared coincidence tolerance (magnitude-relative, computed by the caller).
function getCleanContourVertices(contour: readonly number[], closed: boolean, pointEpsSq: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < contour.length; i += 2) {
    const x = contour[i];
    const y = contour[i + 1];
    if (out.length >= 2) {
      const dx = x - out[out.length - 2];
      const dy = y - out[out.length - 1];
      if (dx * dx + dy * dy <= pointEpsSq) continue;
    }
    out.push(x, y);
  }
  if (closed && out.length >= 4) {
    const dx = out[0] - out[out.length - 2];
    const dy = out[1] - out[out.length - 1];
    if (dx * dx + dy * dy <= pointEpsSq) out.length -= 2;
  }
  return out;
}

// The coincident-point tolerance for a contour set, scaled to the largest coordinate span across all
// contours so it tracks the input magnitude; falls back to a fixed absolute for degenerate extent.
function getContourPointEps(contours: readonly (readonly number[])[]): number {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const contour of contours) {
    for (let i = 0; i < contour.length; i += 2) {
      const x = contour[i];
      const y = contour[i + 1];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const extent = Math.max(maxX - minX, maxY - minY);
  return extent > 0 ? extent * POINT_EPS_RELATIVE : POINT_EPS;
}

// Builds the doubled vertex loop for an open contour: the forward vertices followed by the interior
// vertices in reverse. Offsetting this as a closed loop strokes both sides of the polyline, with the
// two terminal vertices (indices 0 and count - 1) reversing 180° so they take an end cap, not a join.
function getOpenContourLoop(vertices: readonly number[]): number[] {
  const count = vertices.length / 2;
  const loop = vertices.slice();
  for (let k = count - 2; k >= 1; k--) loop.push(vertices[2 * k], vertices[2 * k + 1]);
  return loop;
}

// Signed orientation of a vertex loop under the standard shoelace convention: +1 counter-clockwise,
// -1 clockwise, +1 for a degenerate zero-area loop.
function getRingOrientationSign(vertices: readonly number[]): number {
  const sign = Math.sign(getRingSignedArea(vertices));
  return sign === 0 ? 1 : sign;
}

// Twice-halved shoelace signed area of an implicitly-closed vertex loop.
function getRingSignedArea(vertices: readonly number[]): number {
  let area = 0;
  const count = vertices.length / 2;
  for (let k = 0; k < count; k++) {
    const kn = (k + 1) % count;
    area += vertices[2 * k] * vertices[2 * kn + 1] - vertices[2 * kn] * vertices[2 * k + 1];
  }
  return area * 0.5;
}

// The signed angular sweep from `startAngle` to `endAngle` taking the short way around, in (-PI, PI].
// Convex offset corners subtend the exterior turn angle, which is always the short arc.
function getShortSweep(startAngle: number, endAngle: number): number {
  let sweep = endAngle - startAngle;
  while (sweep <= -Math.PI) sweep += TWO_PI;
  while (sweep > Math.PI) sweep -= TWO_PI;
  return sweep;
}

// Whether a flattened contour is closed: it has at least three points and its last point coincides with
// its first (the explicit closing vertex `flattenPath` appends on a CLOSE). An open polyline whose ends
// happen to coincide is treated as closed — an acceptable inference at pixel scale. `pointEpsSq` is the
// squared coincidence tolerance (magnitude-relative, computed by the caller).
function isClosedContour(contour: readonly number[], pointEpsSq: number): boolean {
  const n = contour.length;
  if (n < 6) return false;
  const dx = contour[0] - contour[n - 2];
  const dy = contour[1] - contour[n - 1];
  return dx * dx + dy * dy <= pointEpsSq;
}

// Tessellates a circular arc about (cx, cy) of the given radius from `startAngle` sweeping by the signed
// `sweep`, pushing only the interior points (the caller emits the arc endpoints). Segment count is set
// so no chord deviates from the true circle by more than `arcTolerance`.
function pushOffsetArc(
  ring: number[],
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  sweep: number,
  arcTolerance: number,
): void {
  const maxAngle = arcTolerance > 0 && arcTolerance < radius ? 2 * Math.acos(1 - arcTolerance / radius) : Math.PI;
  const steps = Math.max(1, Math.ceil(Math.abs(sweep) / maxAngle));
  for (let i = 1; i < steps; i++) {
    const angle = startAngle + sweep * (i / steps);
    ring.push(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
  }
}

// Reverses a flat `[x0, y0, ...]` vertex loop in place-free fashion, flipping its winding while keeping
// vertex 0 first, so a clockwise loop becomes counter-clockwise and vice versa.
function reverseVertexLoop(vertices: readonly number[]): number[] {
  const count = vertices.length / 2;
  const out = new Array<number>(vertices.length);
  out[0] = vertices[0];
  out[1] = vertices[1];
  for (let k = 1; k < count; k++) {
    const source = count - k;
    out[2 * k] = vertices[2 * source];
    out[2 * k + 1] = vertices[2 * source + 1];
  }
  return out;
}

// Default maximum deviation between a round join/end arc and its true circle, in path units — a quarter
// pixel, matching the flattener's default and sane for pixel-scale output.
const DEFAULT_ARC_TOLERANCE = 0.25;

// Default miter length ceiling as a multiple of |delta|, the Clipper2 default: corners sharper than
// ~60° fall back to a bevel.
const DEFAULT_MITER_LIMIT = 2;

const HALF_PI = Math.PI / 2;

const NO_CAPS: ReadonlySet<number> = new Set<number>();

// Fallback absolute coincidence epsilon for degenerate zero-extent input, where the relative form has
// nothing to scale against. Well below any realistic flatten tolerance.
const POINT_EPS = 1e-9;

// Relative coincidence factor: the point-merge tolerance is this fraction of the input's coordinate
// extent, so corners collapse consistently whether the contour is in pixels or micrometres.
const POINT_EPS_RELATIVE = 1e-9;

// Below this cross-product magnitude the two offset edges are effectively parallel and a miter apex is
// unstable, so the join degrades to a bevel.
const PARALLEL_EPS = 1e-12;

const TWO_PI = Math.PI * 2;
