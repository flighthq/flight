import type { Surface } from '@flighthq/types';

let _floodFillVisited: Uint8Array | null = null;

export function fillSurfaceRectangle(
  out: Surface,
  x: number,
  y: number,
  width: number,
  height: number,
  color: number,
): void {
  const r = (color >>> 24) & 0xff;
  const g = (color >> 16) & 0xff;
  const b = (color >> 8) & 0xff;
  const a = color & 0xff;
  const x1 = Math.max(0, x);
  const y1 = Math.max(0, y);
  const x2 = Math.min(out.width, x + width);
  const y2 = Math.min(out.height, y + height);
  for (let py = y1; py < y2; py++) {
    for (let px = x1; px < x2; px++) {
      const i = (py * out.width + px) * 4;
      out.data[i] = r;
      out.data[i + 1] = g;
      out.data[i + 2] = b;
      out.data[i + 3] = a;
    }
  }
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
}
