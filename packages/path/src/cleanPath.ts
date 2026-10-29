// Generated from crates/flight-path/src/clean_path.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { flattenPath } from './flattenPath.ts';
import type { PathRaw } from './path.ts';
import { PathCommand } from './path.ts';

/**
 * Cleans `source` by flattening curves and removing redundant vertices from each contour.
 * Removes consecutive coincident points, near-collinear vertices, and zero-area spikes.
 * Alias-safe: captures all input before writing to `out`.
 */
export function cleanPath(source: Readonly<PathRaw>, tolerance: number, out: PathRaw, flattenTolerance?: number): void {
  flattenTolerance = flattenTolerance ?? 0.25;
  const contours = flattenPath(source, flattenTolerance);
  const winding = source.winding;
  const toleranceSq = tolerance * tolerance;
  out.commands.length = 0;
  out.data.length = 0;
  out.winding = winding;
  for (const contour of contours) {
    const n = Math.trunc(contour.length / 2);
    if (n < 2) {
      continue;
    }
    const closed =
      n >= 3 && withinTolerance(contour[0], contour[1], contour[n * 2 - 2], contour[n * 2 - 1], toleranceSq);
    const count = closed ? n - 1 : n;
    let kept: number[] = [] as never[];
    for (let i = 0; i < count; i += 1) {
      pushCleanVertex(kept, contour[i * 2], contour[i * 2 + 1], toleranceSq);
    }
    if (closed) {
      collapseClosedSeam(kept, toleranceSq);
    }
    const keptCount = Math.trunc(kept.length / 2);
    if (closed) {
      if (keptCount < 3) {
        continue;
      }
    } else {
      if (keptCount < 2) {
        continue;
      }
    }
    out.commands.push(PathCommand.MOVE_TO & 0xff);
    out.data.push(kept[0]);
    out.data.push(kept[1]);
    for (let i = 1; i < keptCount; i += 1) {
      out.commands.push(PathCommand.LINE_TO & 0xff);
      out.data.push(kept[i * 2]);
      out.data.push(kept[i * 2 + 1]);
    }
    if (closed) {
      out.commands.push(PathCommand.CLOSE & 0xff);
    }
  }
}

function collapseClosedSeam(kept: number[], toleranceSq: number): void {
  let changed = true;
  while (changed && Math.trunc(kept.length / 2) > 3) {
    changed = false;
    const last = Math.trunc(kept.length / 2);
    if (isMiddleRemovable(kept, last - 2, last - 1, 0, toleranceSq)) {
      const prefix: number[] = [...kept.slice(0, kept.length - 2)];
      kept.length = 0;
      for (let index = 0, count = prefix.length; index < count; index++) {
        kept.push(prefix[index]);
      }
      changed = true;
      continue;
    }
    if (isMiddleRemovable(kept, last - 1, 0, 1, toleranceSq)) {
      const suffix: number[] = [...kept.slice(2, kept.length)];
      kept.length = 0;
      for (let index = 0, count = suffix.length; index < count; index++) {
        kept.push(suffix[index]);
      }
      changed = true;
    }
  }
}

function isMiddleRemovable(
  kept: Readonly<number[]>,
  prev: number,
  mid: number,
  next: number,
  toleranceSq: number,
): boolean {
  const px = kept[prev * 2];
  const py = kept[prev * 2 + 1];
  const mx = kept[mid * 2];
  const my = kept[mid * 2 + 1];
  const sx = kept[next * 2];
  const sy = kept[next * 2 + 1];
  return isRedundantMiddle(px, py, mx, my, sx, sy, toleranceSq);
}

function isRedundantMiddle(
  px: number,
  py: number,
  mx: number,
  my: number,
  sx: number,
  sy: number,
  toleranceSq: number,
): boolean {
  const dx = sx - px;
  const dy = sy - py;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq <= toleranceSq) {
    return true;
  }
  const cross = dx * (py - my) - dy * (px - mx);
  return (cross * cross) / lengthSq <= toleranceSq;
}

function pushCleanVertex(kept: number[], x: number, y: number, toleranceSq: number): void {
  const k = kept.length;
  if (k >= 2 && withinTolerance(kept[k - 2], kept[k - 1], x, y, toleranceSq)) {
    return;
  }
  while (kept.length >= 4) {
    const m = kept.length;
    if (!isRedundantMiddle(kept[m - 4], kept[m - 3], kept[m - 2], kept[m - 1], x, y, toleranceSq)) {
      break;
    }
    const prefix: number[] = [...kept.slice(0, m - 2)];
    kept.length = 0;
    for (let index = 0, count = prefix.length; index < count; index++) {
      kept.push(prefix[index]);
    }
  }
  kept.push(x);
  kept.push(y);
}

function withinTolerance(ax: number, ay: number, bx: number, by: number, toleranceSq: number): boolean {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy <= toleranceSq;
}
