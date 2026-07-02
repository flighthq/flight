import type { Path } from '@flighthq/types';
import { PathCommand } from '@flighthq/types';

import { flattenPath } from './flattenPath';

// Offsets each contour of `source` by `distance` path units (positive = outset, negative =
// inset). The result is a polyline approximation of the parallel curve, written into `out`.
// Curves are first flattened to `tolerance`, then each segment is shifted along its outward
// normal by `distance`. Closed contours detect winding to ensure positive = outward. Alias-safe.
export function offsetPath(source: Readonly<Path>, distance: number, out: Path, tolerance = 0.25): void {
  const contours = flattenPath(source, tolerance);
  out.commands.length = 0;
  out.data.length = 0;
  out.winding = source.winding;

  if (distance === 0) {
    copyFlatContours(contours, out);
    return;
  }

  for (const contour of contours) {
    offsetContour(contour, distance, out);
  }
}

function offsetContour(pts: Readonly<number[]>, distance: number, out: Path): void {
  const n = pts.length >> 1;
  if (n < 2) return;

  const closed = n >= 3 && pts[0] === pts[(n - 1) * 2] && pts[1] === pts[(n - 1) * 2 + 1];
  const segCount = closed ? n - 1 : n - 1;

  // For closed contours, determine winding so positive distance always outsets.
  // Shoelace area > 0 → CCW (y-up) → left normals point outward.
  // Shoelace area < 0 → CW (y-up, i.e. standard screen CW) → left normals point inward → negate.
  let d = distance;
  if (closed) {
    const area = shoelace(pts, closed ? n - 1 : n);
    if (area > 0) d = -d;
  }

  const normals = new Float64Array(segCount * 2);
  for (let i = 0; i < segCount; i++) {
    const dx = pts[(i + 1) * 2] - pts[i * 2];
    const dy = pts[(i + 1) * 2 + 1] - pts[i * 2 + 1];
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 0) {
      normals[i * 2] = -dy / len;
      normals[i * 2 + 1] = dx / len;
    } else if (i > 0) {
      normals[i * 2] = normals[(i - 1) * 2];
      normals[i * 2 + 1] = normals[(i - 1) * 2 + 1];
    } else {
      normals[i * 2] = 0;
      normals[i * 2 + 1] = 1;
    }
  }

  const result: number[] = [];

  if (closed) {
    addOffsetJoin(pts, 0, normals, segCount - 1, 0, d, result);
    for (let i = 1; i < segCount; i++) {
      addOffsetJoin(pts, i, normals, i - 1, i, d, result);
    }
  } else {
    result.push(pts[0] + normals[0] * d, pts[1] + normals[1] * d);
    for (let i = 1; i < n - 1; i++) {
      addOffsetJoin(pts, i, normals, i - 1, i, d, result);
    }
    result.push(
      pts[(n - 1) * 2] + normals[(segCount - 1) * 2] * d,
      pts[(n - 1) * 2 + 1] + normals[(segCount - 1) * 2 + 1] * d,
    );
  }

  if (result.length < 4) return;
  out.commands.push(PathCommand.MOVE_TO);
  out.data.push(result[0], result[1]);
  for (let i = 2; i < result.length; i += 2) {
    out.commands.push(PathCommand.LINE_TO);
    out.data.push(result[i], result[i + 1]);
  }
  if (closed) out.commands.push(PathCommand.CLOSE);
}

function addOffsetJoin(
  pts: Readonly<number[]>,
  ptIdx: number,
  normals: Readonly<Float64Array>,
  seg0: number,
  seg1: number,
  distance: number,
  result: number[],
): void {
  const px = pts[ptIdx * 2];
  const py = pts[ptIdx * 2 + 1];
  const n0x = normals[seg0 * 2];
  const n0y = normals[seg0 * 2 + 1];
  const n1x = normals[seg1 * 2];
  const n1y = normals[seg1 * 2 + 1];

  const cross = n0x * n1y - n0y * n1x;
  if (Math.abs(cross) < 1e-8) {
    result.push(px + n0x * distance, py + n0y * distance);
    return;
  }

  // Segment directions: perpendicular to normal, (ny, -nx).
  const d0x = n0y;
  const d0y = -n0x;

  const ox0 = px + n0x * distance;
  const oy0 = py + n0y * distance;
  const ox1 = px + n1x * distance;
  const oy1 = py + n1y * distance;

  // Intersect: ox0 + s*d0 = ox1 + t*d1
  const dpx = ox1 - ox0;
  const dpy = oy1 - oy0;
  const d1x = n1y;
  const d1y = -n1x;
  const det = d0x * d1y - d0y * d1x;
  if (Math.abs(det) < 1e-12) {
    result.push(px + n0x * distance, py + n0y * distance);
    return;
  }
  const s = (dpx * d1y - dpy * d1x) / det;
  const mx = ox0 + s * d0x;
  const my = oy0 + s * d0y;

  const miterDistSq = (mx - px) * (mx - px) + (my - py) * (my - py);
  const absDist = Math.abs(distance);
  const limitSq = absDist * 4 * (absDist * 4);
  if (miterDistSq <= limitSq) {
    result.push(mx, my);
  } else {
    result.push(ox0, oy0, ox1, oy1);
  }
}

function copyFlatContours(contours: Readonly<number[][]>, out: Path): void {
  for (const contour of contours) {
    const n = contour.length >> 1;
    if (n < 2) continue;
    const closed = n >= 3 && contour[0] === contour[(n - 1) * 2] && contour[1] === contour[(n - 1) * 2 + 1];
    out.commands.push(PathCommand.MOVE_TO);
    out.data.push(contour[0], contour[1]);
    const last = closed ? n - 1 : n;
    for (let i = 1; i < last; i++) {
      out.commands.push(PathCommand.LINE_TO);
      out.data.push(contour[i * 2], contour[i * 2 + 1]);
    }
    if (closed) out.commands.push(PathCommand.CLOSE);
  }
}

function shoelace(pts: Readonly<number[]>, n: number): number {
  let area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += pts[i * 2] * pts[j * 2 + 1];
    area -= pts[j * 2] * pts[i * 2 + 1];
  }
  return area / 2;
}
