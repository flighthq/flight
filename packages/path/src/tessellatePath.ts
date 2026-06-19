import type { Path, PathMesh } from '@flighthq/types';

import { flattenPath } from './flattenPath';

// Triangulates a path's fill into a PathMesh by flattening its curves, then ear-clipping each contour.
// This is the direct-fill route (draw the mesh, MSAA the edges) — the parallel to flatten + stencil
// cover. Each contour is triangulated independently as a simple polygon: concave outlines are handled,
// but holes/overlap/self-intersection are NOT subtracted here (a hole contour fills solid). Use the
// flatten + stencil-then-cover route for those. Winding rule is not consulted by this triangulator.
export function tessellatePath(path: Readonly<Path>, tolerance = 0.25): PathMesh {
  const contours = flattenPath(path, tolerance);
  const vertices: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < contours.length; i++) {
    tessellateContour(contours[i], vertices, indices);
  }
  return { vertices, indices };
}

// Ear-clips one simple polygon contour (flat x,y pairs) into the shared vertex/index buffers. Vertices
// are appended in source order; the working order is normalized to CCW for the convexity test.
function tessellateContour(source: number[], vertices: number[], indices: number[]): void {
  // Drop coincident consecutive points (zero-length edges) into `pts` first. A duplicate vertex makes a
  // degenerate corner that is never a valid ear, which stalls the clip loop and leaves the polygon only
  // partly triangulated — common when an outline repeats its start point (moveTo P then lineTo P).
  const pts: number[] = [];
  for (let i = 0; i < source.length; i += 2) {
    const x = source[i];
    const y = source[i + 1];
    if (pts.length >= 2 && pts[pts.length - 2] === x && pts[pts.length - 1] === y) continue;
    pts.push(x, y);
  }
  const contour = pts;

  let count = contour.length >> 1;
  // Drop a trailing point coincident with the first (an explicitly closed contour).
  if (count >= 2 && contour[0] === contour[(count - 1) * 2] && contour[1] === contour[(count - 1) * 2 + 1]) {
    count -= 1;
  }
  if (count < 3) return;

  const base = vertices.length >> 1;
  for (let i = 0; i < count; i++) {
    vertices.push(contour[i * 2], contour[i * 2 + 1]);
  }

  let twiceArea = 0;
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count;
    twiceArea += contour[i * 2] * contour[j * 2 + 1] - contour[j * 2] * contour[i * 2 + 1];
  }

  // Working ring of contour-vertex indices, normalized to counter-clockwise so a positive cross
  // product means a convex (ear-candidate) vertex.
  const ring: number[] = [];
  if (twiceArea < 0) {
    for (let i = count - 1; i >= 0; i--) ring.push(i);
  } else {
    for (let i = 0; i < count; i++) ring.push(i);
  }

  let guard = ring.length * ring.length;
  while (ring.length > 3 && guard-- > 0) {
    let clipped = false;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[(i + ring.length - 1) % ring.length];
      const b = ring[i];
      const c = ring[(i + 1) % ring.length];
      if (isEar(contour, ring, a, b, c)) {
        indices.push(base + a, base + b, base + c);
        ring.splice(i, 1);
        clipped = true;
        break;
      }
    }
    if (!clipped) break; // degenerate (e.g. self-intersection); stop rather than spin
  }
  if (ring.length === 3) {
    indices.push(base + ring[0], base + ring[1], base + ring[2]);
  }
}

// True when triangle (a,b,c) is a convex corner (CCW) containing no other ring vertex.
function isEar(contour: number[], ring: number[], a: number, b: number, c: number): boolean {
  const ax = contour[a * 2];
  const ay = contour[a * 2 + 1];
  const bx = contour[b * 2];
  const by = contour[b * 2 + 1];
  const cx = contour[c * 2];
  const cy = contour[c * 2 + 1];
  // Reflex or collinear corner is not an ear.
  if ((bx - ax) * (cy - by) - (by - ay) * (cx - bx) <= 0) return false;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    if (p === a || p === b || p === c) continue;
    if (isPointInTriangle(contour[p * 2], contour[p * 2 + 1], ax, ay, bx, by, cx, cy)) return false;
  }
  return true;
}

function isPointInTriangle(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): boolean {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const hasNegative = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPositive = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNegative && hasPositive);
}
