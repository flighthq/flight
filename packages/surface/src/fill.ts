import type { Surface } from '@flighthq/types';

export function fillSurfaceRectangle(
  dest: Surface,
  x: number,
  y: number,
  width: number,
  height: number,
  color: number,
): void {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const a = (color >>> 24) & 0xff;
  const x1 = Math.max(0, x);
  const y1 = Math.max(0, y);
  const x2 = Math.min(dest.width, x + width);
  const y2 = Math.min(dest.height, y + height);
  for (let py = y1; py < y2; py++) {
    for (let px = x1; px < x2; px++) {
      const i = (py * dest.width + px) * 4;
      dest.data[i] = r;
      dest.data[i + 1] = g;
      dest.data[i + 2] = b;
      dest.data[i + 3] = a;
    }
  }
}

export function floodFillSurface(dest: Surface, x: number, y: number, color: number): void {
  if (x < 0 || x >= dest.width || y < 0 || y >= dest.height) return;

  const fillR = (color >> 16) & 0xff;
  const fillG = (color >> 8) & 0xff;
  const fillB = color & 0xff;
  const fillA = (color >>> 24) & 0xff;

  const targetI = (y * dest.width + x) * 4;
  const targetR = dest.data[targetI];
  const targetG = dest.data[targetI + 1];
  const targetB = dest.data[targetI + 2];
  const targetA = dest.data[targetI + 3];

  if (targetR === fillR && targetG === fillG && targetB === fillB && targetA === fillA) return;

  const stack: number[] = [x + y * dest.width];
  const visited = new Uint8Array(dest.width * dest.height);

  while (stack.length > 0) {
    const idx = stack.pop()!;
    if (visited[idx]) continue;
    visited[idx] = 1;

    const px = idx % dest.width;
    const py = Math.floor(idx / dest.width);
    const i = idx * 4;

    if (
      dest.data[i] !== targetR ||
      dest.data[i + 1] !== targetG ||
      dest.data[i + 2] !== targetB ||
      dest.data[i + 3] !== targetA
    ) {
      continue;
    }

    dest.data[i] = fillR;
    dest.data[i + 1] = fillG;
    dest.data[i + 2] = fillB;
    dest.data[i + 3] = fillA;

    if (px > 0) stack.push(idx - 1);
    if (px < dest.width - 1) stack.push(idx + 1);
    if (py > 0) stack.push(idx - dest.width);
    if (py < dest.height - 1) stack.push(idx + dest.width);
  }
}
