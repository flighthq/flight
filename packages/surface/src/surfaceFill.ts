import { invalidateImageResource } from '@flighthq/resources';
import type { Surface, SurfaceRegion } from '@flighthq/types';

let _floodFillVisited: Uint8Array | null = null;

/**
 * Fills the rectangular `dest` region with a packed RGBA `color`. Pixels of the
 * region that fall outside the surface are skipped.
 */
export function fillSurfaceRectangle(dest: Readonly<SurfaceRegion>, color: number): void {
  const r = (color >>> 24) & 0xff;
  const g = (color >> 16) & 0xff;
  const b = (color >> 8) & 0xff;
  const a = color & 0xff;
  for (let py = 0; py < dest.height; py++) {
    const y = dest.y + py;
    if (y < 0 || y >= dest.surface.height) continue;
    for (let px = 0; px < dest.width; px++) {
      const x = dest.x + px;
      if (x < 0 || x >= dest.surface.width) continue;
      const i = (y * dest.surface.width + x) * 4;
      dest.surface.data[i] = r;
      dest.surface.data[i + 1] = g;
      dest.surface.data[i + 2] = b;
      dest.surface.data[i + 3] = a;
    }
  }
  invalidateImageResource(dest.surface);
}

/**
 * Flood-fills a connected region of `out` starting at `(x, y)`. Uses a
 * module-level visited buffer that grows as needed and is reused across calls.
 */
export function floodFillSurface(out: Surface, x: number, y: number, color: number): void {
  if (x < 0 || x >= out.width || y < 0 || y >= out.height) return;

  const fillR = (color >>> 24) & 0xff;
  const fillG = (color >> 16) & 0xff;
  const fillB = (color >> 8) & 0xff;
  const fillA = color & 0xff;

  const targetI = (y * out.width + x) * 4;
  const targetR = out.data[targetI];
  const targetG = out.data[targetI + 1];
  const targetB = out.data[targetI + 2];
  const targetA = out.data[targetI + 3];

  if (targetR === fillR && targetG === fillG && targetB === fillB && targetA === fillA) return;

  const needed = out.width * out.height;
  if (_floodFillVisited === null || _floodFillVisited.length < needed) {
    _floodFillVisited = new Uint8Array(needed);
  } else {
    _floodFillVisited.fill(0, 0, needed);
  }
  const visited = _floodFillVisited;

  const stack: number[] = [x + y * out.width];

  while (stack.length > 0) {
    const idx = stack.pop()!;
    if (visited[idx]) continue;
    visited[idx] = 1;

    const px = idx % out.width;
    const py = Math.floor(idx / out.width);
    const i = idx * 4;

    if (
      out.data[i] !== targetR ||
      out.data[i + 1] !== targetG ||
      out.data[i + 2] !== targetB ||
      out.data[i + 3] !== targetA
    ) {
      continue;
    }

    out.data[i] = fillR;
    out.data[i + 1] = fillG;
    out.data[i + 2] = fillB;
    out.data[i + 3] = fillA;

    if (px > 0) stack.push(idx - 1);
    if (px < out.width - 1) stack.push(idx + 1);
    if (py > 0) stack.push(idx - out.width);
    if (py < out.height - 1) stack.push(idx + out.width);
  }
  invalidateImageResource(out);
}
