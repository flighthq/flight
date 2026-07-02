import type { Path, StrokeStyle } from '@flighthq/types';
import { PathCommand } from '@flighthq/types';

import { appendPathClose } from './path';

export type { StrokeStyle } from '@flighthq/types';

// Converts the centerline `path` into a fillable outline `Path` by offsetting both sides by
// half the stroke width, joining corners per `style.join`, and capping open endpoints per
// `style.cap`. The result is a collection of closed contours suitable for `tessellatePath`.
//
// Curves are pre-flattened to `tolerance` path units before offsetting; the offset contours are
// themselves composed of straight segments (the flattenPath route means no new curve math is
// needed at the outline layer). Pass a tight tolerance for smooth rounded joins/caps.
//
// This is the direct route to stroke fill; the renderer's stencil-then-cover route for hairline
// precision is outside this function's scope.
export function strokePath(path: Readonly<Path>, style: Readonly<StrokeStyle>, tolerance = 0.25): Path {
  const width = style.width ?? 1;
  const join = style.join ?? 'miter';
  const cap = style.cap ?? 'butt';
  const miterLimit = style.miterLimit ?? 4;
  const halfWidth = width / 2;
  const result: Path = { commands: [], data: [], winding: 'nonZero' };
  // Decode path into flat subpath polylines, respecting the closed flag.
  const subpaths = decodeSubpaths(path, tolerance);
  const dash = style.dash && style.dash.length > 0 ? style.dash : null;
  const dashOffset = style.dashOffset ?? 0;
  for (const subpath of subpaths) {
    if (subpath.points.length < 2) continue;
    const segments = dash
      ? applyDash(subpath.points, subpath.closed, dash, dashOffset)
      : [{ points: subpath.points, closed: subpath.closed }];
    for (const seg of segments) {
      if (seg.points.length < 2) continue;
      strokeSubpath(seg.points, seg.closed, halfWidth, join, cap, miterLimit, result, tolerance);
    }
  }
  return result;
}

// Adds arc sample points from `startAngle` to `endAngle` around center (cx,cy) at radius `r`
// into `out`. `ccw=true` goes counter-clockwise (decreasing angle in standard math convention).
function addArcPoints(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
  ccw: boolean,
  tolerance: number,
  out: number[],
): void {
  // Number of steps from tolerance: the chord error for n steps is r*(1-cos(π/n)) ≤ tolerance.
  // n ≥ π / acos(1 - tolerance/r). Clamp to a sensible minimum (4).
  const ratio = Math.max(0, Math.min(1, tolerance / r));
  const n = Math.max(4, Math.ceil(Math.PI / Math.acos(1 - ratio)));
  let delta = endAngle - startAngle;
  if (ccw) {
    if (delta > 0) delta -= Math.PI * 2;
  } else {
    if (delta < 0) delta += Math.PI * 2;
  }
  const steps = Math.ceil(Math.abs(delta) / ((Math.PI * 2) / n));
  if (steps <= 1) return;
  const stepAngle = delta / steps;
  for (let i = 1; i < steps; i++) {
    const angle = startAngle + i * stepAngle;
    out.push(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
  }
}

// Adds a start or end cap for an open subpath.
// `nx, ny` = left normal of the adjacent segment (perpendicular, pointing left of travel).
// `edx, edy` = extension direction: the direction to extend the cap outward from the endpoint.
//   For start cap: extend backward (-segment direction).
//   For end cap:   extend forward  (+segment direction).
function addCap(
  px: number,
  py: number,
  nx: number,
  ny: number,
  edx: number,
  edy: number,
  halfWidth: number,
  cap: 'butt' | 'round' | 'square',
  left: number[],
  right: number[],
  tolerance: number,
  isStart: boolean,
): void {
  // Left side offset (in direction of left normal), right side offset (opposite).
  const lx = px + nx * halfWidth;
  const ly = py + ny * halfWidth;
  const rx = px - nx * halfWidth;
  const ry = py - ny * halfWidth;
  if (cap === 'butt') {
    left.push(lx, ly);
    right.push(rx, ry);
  } else if (cap === 'square') {
    // Extend by halfWidth in the cap extension direction.
    left.push(lx + edx * halfWidth, ly + edy * halfWidth);
    right.push(rx + edx * halfWidth, ry + edy * halfWidth);
  } else {
    // Round cap: semicircle spanning the full width, centered at the endpoint.
    if (isStart) {
      left.push(lx, ly);
      right.push(rx, ry);
      // Arc from right side angle to left side angle in the extension direction.
      const startAngle = Math.atan2(-ny, -nx);
      const endAngle = Math.atan2(ny, nx);
      addArcPoints(px, py, halfWidth, startAngle, endAngle, false, tolerance, right);
    } else {
      left.push(lx, ly);
      addArcPoints(px, py, halfWidth, Math.atan2(ny, nx), Math.atan2(-ny, -nx), true, tolerance, left);
      right.push(rx, ry);
    }
  }
}

// Adds a join (corner) between two adjacent segments to the left and right offset arrays.
function addJoin(
  px: number,
  py: number,
  nx0: number,
  ny0: number,
  nx1: number,
  ny1: number,
  halfWidth: number,
  join: 'bevel' | 'miter' | 'round',
  miterLimit: number,
  left: number[],
  right: number[],
  tolerance: number,
): void {
  // Left side: offset by +normal, Right side: offset by -normal.
  const lx0 = px + nx0 * halfWidth;
  const ly0 = py + ny0 * halfWidth;
  const rx0 = px - nx0 * halfWidth;
  const ry0 = py - ny0 * halfWidth;
  const lx1 = px + nx1 * halfWidth;
  const ly1 = py + ny1 * halfWidth;
  const rx1 = px - nx1 * halfWidth;
  const ry1 = py - ny1 * halfWidth;
  if (join === 'miter') {
    // Miter join: intersect the offset lines. Fall back to bevel if miter length exceeds limit.
    const cross = nx0 * ny1 - ny0 * nx1;
    if (Math.abs(cross) < 1e-8) {
      // Parallel segments: simple bevel (just two points each side).
      left.push(lx0, ly0);
      right.push(rx0, ry0);
    } else {
      // Find the miter intersection point.
      const dx = lx1 - lx0;
      const dy = ly1 - ly0;
      const t = (dx * ny1 - dy * nx1) / cross;
      const mx = lx0 + t * nx0;
      const my = ly0 + t * ny0;
      const miterLen = Math.sqrt((mx - px) * (mx - px) + (my - py) * (my - py));
      if (miterLen <= halfWidth * miterLimit) {
        left.push(mx, my);
        // Miter on the other side (mirror through center).
        const rmx = px * 2 - mx;
        const rmy = py * 2 - my;
        right.push(rmx, rmy);
      } else {
        // Degrade to bevel.
        left.push(lx0, ly0, lx1, ly1);
        right.push(rx0, ry0, rx1, ry1);
      }
    }
  } else if (join === 'round') {
    // Round join: arc from (lx0,ly0) to (lx1,ly1) around the outer side.
    left.push(lx0, ly0);
    addArcPoints(px, py, halfWidth, Math.atan2(ny0, nx0), Math.atan2(ny1, nx1), true, tolerance, left);
    left.push(lx1, ly1);
    right.push(rx0, ry0);
    addArcPoints(px, py, halfWidth, Math.atan2(-ny0, -nx0), Math.atan2(-ny1, -nx1), false, tolerance, right);
    right.push(rx1, ry1);
  } else {
    // Bevel: two points per side.
    left.push(lx0, ly0, lx1, ly1);
    right.push(rx0, ry0, rx1, ry1);
  }
}

// Splits a subpath into dash segments based on the dash pattern.
function applyDash(
  pts: Readonly<number[]>,
  closed: boolean,
  dash: Readonly<number[]>,
  dashOffset: number,
): DashSegment[] {
  const result: DashSegment[] = [];
  if (dash.length === 0) {
    result.push({ points: pts as number[], closed });
    return result;
  }
  const totalDashLength = dash.reduce((s, d) => s + d, 0);
  if (totalDashLength <= 0) {
    result.push({ points: pts as number[], closed });
    return result;
  }
  // Normalize offset into the pattern.
  const offset = ((dashOffset % totalDashLength) + totalDashLength) % totalDashLength;
  // Find starting dash index and remaining length in that dash.
  let dashIndex = 0;
  let remaining = 0;
  let isOn = true;
  {
    let acc = 0;
    for (let i = 0; i < dash.length; i++) {
      if (acc + dash[i] > offset) {
        dashIndex = i;
        remaining = dash[i] - (offset - acc);
        isOn = i % 2 === 0;
        break;
      }
      acc += dash[i];
    }
  }
  let current: number[] | null = null;
  const n = pts.length >> 1;
  for (let i = 0; i < n - 1; i++) {
    const x0 = pts[i * 2];
    const y0 = pts[i * 2 + 1];
    const x1 = pts[(i + 1) * 2];
    const y1 = pts[(i + 1) * 2 + 1];
    const dx = x1 - x0;
    const dy = y1 - y0;
    const segLen = Math.sqrt(dx * dx + dy * dy);
    if (isOn && current === null) {
      current = [x0, y0];
    }
    let consumed = 0;
    while (consumed < segLen) {
      const step = Math.min(remaining, segLen - consumed);
      const t = (consumed + step) / segLen;
      const ix = x0 + t * dx;
      const iy = y0 + t * dy;
      if (isOn) {
        if (current === null) current = [x0 + (consumed / segLen) * dx, y0 + (consumed / segLen) * dy];
        current.push(ix, iy);
      } else {
        if (current !== null) {
          if (current.length >= 4) result.push({ points: current, closed: false });
          current = null;
        }
        if (step >= remaining) {
          current = [ix, iy];
        }
      }
      consumed += step;
      remaining -= step;
      if (remaining <= 1e-10) {
        dashIndex = (dashIndex + 1) % dash.length;
        remaining = dash[dashIndex];
        isOn = dashIndex % 2 === 0;
        if (isOn && current === null) {
          current = [ix, iy];
        } else if (!isOn && current !== null) {
          if (current.length >= 4) result.push({ points: current, closed: false });
          current = null;
        }
      }
    }
  }
  if (current !== null && current.length >= 4) {
    result.push({ points: current, closed: false });
  }
  return result;
}

function decodeSubpaths(path: Readonly<Path>, tolerance: number): StrokeSubpath[] {
  // Use the flattenPath internal logic (re-implemented here to track closed-ness per subpath
  // and to avoid returning separate contours without their closed flag).
  const commands = path.commands;
  const data = path.data;
  const toleranceSq = tolerance * tolerance;
  const subpaths: StrokeSubpath[] = [];
  let current: StrokeSubpath | null = null;
  let x = 0;
  let y = 0;
  let contourStartX = 0;
  let contourStartY = 0;
  let di = 0;
  const ensureCurrent = (): StrokeSubpath => {
    if (current === null) {
      current = { points: [0, 0], closed: false };
      subpaths.push(current);
      x = 0;
      y = 0;
    }
    return current;
  };
  for (let ci = 0; ci < commands.length; ci++) {
    const command = commands[ci];
    if (command === PathCommand.MOVE_TO) {
      x = data[di];
      y = data[di + 1];
      di += 2;
      contourStartX = x;
      contourStartY = y;
      current = { points: [x, y], closed: false };
      subpaths.push(current);
    } else if (command === PathCommand.WIDE_MOVE_TO) {
      x = data[di + 2];
      y = data[di + 3];
      di += 4;
      contourStartX = x;
      contourStartY = y;
      current = { points: [x, y], closed: false };
      subpaths.push(current);
    } else if (command === PathCommand.LINE_TO) {
      const sp = ensureCurrent();
      x = data[di];
      y = data[di + 1];
      di += 2;
      sp.points.push(x, y);
    } else if (command === PathCommand.WIDE_LINE_TO) {
      const sp = ensureCurrent();
      x = data[di + 2];
      y = data[di + 3];
      di += 4;
      sp.points.push(x, y);
    } else if (command === PathCommand.CURVE_TO) {
      const sp = ensureCurrent();
      flattenQuadratic(sp.points, x, y, data[di], data[di + 1], data[di + 2], data[di + 3], toleranceSq, 0);
      x = data[di + 2];
      y = data[di + 3];
      di += 4;
    } else if (command === PathCommand.CUBIC_CURVE_TO) {
      const sp = ensureCurrent();
      flattenCubic(
        sp.points,
        x,
        y,
        data[di],
        data[di + 1],
        data[di + 2],
        data[di + 3],
        data[di + 4],
        data[di + 5],
        toleranceSq,
        0,
      );
      x = data[di + 4];
      y = data[di + 5];
      di += 6;
    } else if (command === PathCommand.CLOSE) {
      if (current !== null) {
        current.closed = true;
        x = contourStartX;
        y = contourStartY;
        current = null;
      }
    }
  }
  return subpaths;
}

function distChordSq(px: number, py: number, x0: number, y0: number, x1: number, y1: number): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    const ax = px - x0;
    const ay = py - y0;
    return ax * ax + ay * ay;
  }
  const cross = dx * (y0 - py) - dy * (x0 - px);
  return (cross * cross) / lenSq;
}

function flattenCubic(
  out: number[],
  x0: number,
  y0: number,
  c1x: number,
  c1y: number,
  c2x: number,
  c2y: number,
  x1: number,
  y1: number,
  toleranceSq: number,
  depth: number,
): void {
  const dxc1 = distChordSq(c1x, c1y, x0, y0, x1, y1);
  const dxc2 = distChordSq(c2x, c2y, x0, y0, x1, y1);
  if (depth >= MAX_SUBDIVISION_DEPTH || (dxc1 <= toleranceSq && dxc2 <= toleranceSq)) {
    out.push(x1, y1);
    return;
  }
  const x01 = (x0 + c1x) / 2;
  const y01 = (y0 + c1y) / 2;
  const x12 = (c1x + c2x) / 2;
  const y12 = (c1y + c2y) / 2;
  const x23 = (c2x + x1) / 2;
  const y23 = (c2y + y1) / 2;
  const x012 = (x01 + x12) / 2;
  const y012 = (y01 + y12) / 2;
  const x123 = (x12 + x23) / 2;
  const y123 = (y12 + y23) / 2;
  const xm = (x012 + x123) / 2;
  const ym = (y012 + y123) / 2;
  flattenCubic(out, x0, y0, x01, y01, x012, y012, xm, ym, toleranceSq, depth + 1);
  flattenCubic(out, xm, ym, x123, y123, x23, y23, x1, y1, toleranceSq, depth + 1);
}

function flattenQuadratic(
  out: number[],
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  x1: number,
  y1: number,
  toleranceSq: number,
  depth: number,
): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const lengthSq = dx * dx + dy * dy;
  let distSq;
  if (lengthSq === 0) {
    const ax = cx - x0;
    const ay = cy - y0;
    distSq = ax * ax + ay * ay;
  } else {
    const cross = dx * (y0 - cy) - dy * (x0 - cx);
    distSq = (cross * cross) / lengthSq;
  }
  if (depth >= MAX_SUBDIVISION_DEPTH || distSq <= toleranceSq) {
    out.push(x1, y1);
    return;
  }
  const x01 = (x0 + cx) / 2;
  const y01 = (y0 + cy) / 2;
  const x12 = (cx + x1) / 2;
  const y12 = (cy + y1) / 2;
  const xm = (x01 + x12) / 2;
  const ym = (y01 + y12) / 2;
  flattenQuadratic(out, x0, y0, x01, y01, xm, ym, toleranceSq, depth + 1);
  flattenQuadratic(out, xm, ym, x12, y12, x1, y1, toleranceSq, depth + 1);
}

// Generates the stroke outline for one subpath polyline.
function strokeSubpath(
  pts: Readonly<number[]>,
  closed: boolean,
  halfWidth: number,
  join: 'bevel' | 'miter' | 'round',
  cap: 'butt' | 'round' | 'square',
  miterLimit: number,
  out: Path,
  tolerance: number,
): void {
  const n = pts.length >> 1;
  if (n < 2) return;
  // Build left and right offset contours.
  const left: number[] = [];
  const right: number[] = [];
  // Normals for each segment.
  const normals = new Array<number>((n - 1) * 2);
  for (let i = 0; i < n - 1; i++) {
    const dx = pts[(i + 1) * 2] - pts[i * 2];
    const dy = pts[(i + 1) * 2 + 1] - pts[i * 2 + 1];
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 0) {
      normals[i * 2] = -dy / len;
      normals[i * 2 + 1] = dx / len;
    } else {
      normals[i * 2] = i > 0 ? normals[(i - 1) * 2] : 0;
      normals[i * 2 + 1] = i > 0 ? normals[(i - 1) * 2 + 1] : 1;
    }
  }
  if (closed) {
    // For closed paths: add join at every vertex.
    for (let i = 0; i < n - 1; i++) {
      const prev = (i + n - 2) % (n - 1);
      const curr = i;
      const nx0 = normals[prev * 2];
      const ny0 = normals[prev * 2 + 1];
      const nx1 = normals[curr * 2];
      const ny1 = normals[curr * 2 + 1];
      addJoin(pts[i * 2], pts[i * 2 + 1], nx0, ny0, nx1, ny1, halfWidth, join, miterLimit, left, right, tolerance);
    }
  } else {
    // Start cap. The segment direction for the first segment points "forward"; for the start cap we
    // need the perpendicular (left normal at the first point) and the segment direction itself so
    // square/round caps can extend outward.
    const sn0x = normals[0];
    const sn0y = normals[1];
    // Segment direction (forward): perpendicular to left normal = (sn0y, -sn0x).
    // But for start cap we extend BACKWARD: (-sn0y, sn0x).
    addCap(pts[0], pts[1], sn0x, sn0y, -sn0y, sn0x, halfWidth, cap, left, right, tolerance, true);
    // Inner joins.
    for (let i = 1; i < n - 1; i++) {
      const nx0 = normals[(i - 1) * 2];
      const ny0 = normals[(i - 1) * 2 + 1];
      const nx1 = normals[i * 2];
      const ny1 = normals[i * 2 + 1];
      addJoin(pts[i * 2], pts[i * 2 + 1], nx0, ny0, nx1, ny1, halfWidth, join, miterLimit, left, right, tolerance);
    }
    // End cap. Extend FORWARD: (sn_last_y, -sn_last_x).
    const snLx = normals[(n - 2) * 2];
    const snLy = normals[(n - 2) * 2 + 1];
    addCap(
      pts[(n - 1) * 2],
      pts[(n - 1) * 2 + 1],
      snLx,
      snLy,
      snLy,
      -snLx,
      halfWidth,
      cap,
      left,
      right,
      tolerance,
      false,
    );
  }
  // Emit the outline as a single closed path: left side forward, right side backward.
  if (left.length < 4) return;
  out.commands.push(PathCommand.MOVE_TO);
  out.data.push(left[0], left[1]);
  for (let i = 2; i < left.length; i += 2) {
    out.commands.push(PathCommand.LINE_TO);
    out.data.push(left[i], left[i + 1]);
  }
  // Traverse right side in reverse.
  for (let i = right.length - 2; i >= 0; i -= 2) {
    out.commands.push(PathCommand.LINE_TO);
    out.data.push(right[i], right[i + 1]);
  }
  appendPathClose(out);
}

interface DashSegment {
  closed: boolean;
  points: number[];
}

interface StrokeSubpath {
  closed: boolean;
  points: number[];
}

const MAX_SUBDIVISION_DEPTH = 16;
