// Generated from crates/flight-path/src/tessellate_path.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { flattenPath } from './flattenPath.ts';
import type { PathMesh, PathRaw } from './path.ts';

function isEar(contour: Readonly<number[]>, ring: Readonly<number[]>, a: number, b: number, c: number): boolean {
  const ax = contour[a * 2];
  const ay = contour[a * 2 + 1];
  const bx = contour[b * 2];
  const by = contour[b * 2 + 1];
  const cx = contour[c * 2];
  const cy = contour[c * 2 + 1];
  if ((bx - ax) * (cy - by) - (by - ay) * (cx - bx) <= 0.0) {
    return false;
  }
  for (let i = 0; i < ring.length; i += 1) {
    const p = ring[i];
    if (p === a || p === b || p === c) {
      continue;
    }
    if (isPointInTriangle(contour[p * 2], contour[p * 2 + 1], ax, ay, bx, by, cx, cy)) {
      return false;
    }
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
  const hasNegative = d1 < 0.0 || d2 < 0.0 || d3 < 0.0;
  const hasPositive = d1 > 0.0 || d2 > 0.0 || d3 > 0.0;
  return !(hasNegative && hasPositive);
}

function tessellateContour(source: Readonly<number[]>, vertices: number[], indices: number[]): void {
  let pts: number[] = [] as never[];
  let i = 0;
  while (i < source.length) {
    const x = source[i];
    const y = source[i + 1];
    if (pts.length >= 2 && pts[pts.length - 2] === x && pts[pts.length - 1] === y) {
      i += 2;
      continue;
    }
    pts.push(x);
    pts.push(y);
    i += 2;
  }
  let count = Math.trunc(pts.length / 2);
  if (count >= 2 && pts[0] === pts[(count - 1) * 2] && pts[1] === pts[(count - 1) * 2 + 1]) {
    count -= 1;
  }
  if (count < 3) {
    return;
  }
  const base = Math.trunc(vertices.length / 2) >>> 0;
  for (let i = 0; i < count; i += 1) {
    vertices.push(pts[i * 2]);
    vertices.push(pts[i * 2 + 1]);
  }
  let twiceArea: number = 0.0;
  for (let i = 0; i < count; i += 1) {
    const j = (i + 1) % count;
    twiceArea += pts[i * 2] * pts[j * 2 + 1] - pts[j * 2] * pts[i * 2 + 1];
  }
  let ring: number[] = [] as never[];
  if (twiceArea < 0.0) {
    let i = count;
    while (i > 0) {
      i -= 1;
      ring.push(i);
    }
  } else {
    for (let i = 0; i < count; i += 1) {
      ring.push(i);
    }
  }
  let guard = ring.length * ring.length;
  while (ring.length > 3 && guard > 0) {
    guard -= 1;
    let clipped = false;
    for (let i = 0; i < ring.length; i += 1) {
      const a = ring[(i + ring.length - 1) % ring.length];
      const b = ring[i];
      const c = ring[(i + 1) % ring.length];
      if (isEar(pts, ring, a, b, c)) {
        indices.push(base + (a >>> 0));
        indices.push(base + (b >>> 0));
        indices.push(base + (c >>> 0));
        let remainingRing: number[] = [...ring.slice(0, i)];
        {
          const source = ring.slice(i + 1, ring.length);
          for (let index = 0, count = source.length; index < count; index++) {
            remainingRing.push(source[index]);
          }
        }
        ring = remainingRing;
        clipped = true;
        break;
      }
    }
    if (!clipped) {
      break;
    }
  }
  if (ring.length === 3) {
    indices.push(base + (ring[0] >>> 0));
    indices.push(base + (ring[1] >>> 0));
    indices.push(base + (ring[2] >>> 0));
  }
}

/**
 * Triangulates a path's fill into a PathMesh by flattening its curves, then ear-clipping each contour.
 */
export function tessellatePath(path: Readonly<PathRaw>, tolerance?: number): PathMesh {
  tolerance = tolerance ?? 0.25;
  let vertices: number[] = [] as never[];
  let indices: number[] = [] as never[];
  const contours = flattenPath(path, tolerance);
  for (let i = 0; i < contours.length; i += 1) {
    tessellateContour(contours[i], vertices, indices);
  }
  return { vertices: vertices, indices: indices };
}

/**
 * Tessellates into an existing `PathMesh`, clearing and reusing its backing arrays.
 */
export function tessellatePathInto(path: Readonly<PathRaw>, out: PathMesh, tolerance?: number): void {
  tolerance = tolerance ?? 0.25;
  out.vertices.length = 0;
  out.indices.length = 0;
  const contours = flattenPath(path, tolerance);
  for (let i = 0; i < contours.length; i += 1) {
    tessellateContour(contours[i], out.vertices, out.indices);
  }
}
