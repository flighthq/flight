import type { Surface } from '@flighthq/types';

export interface ColorBoundsRect {
  height: number;
  width: number;
  x: number;
  y: number;
}

export function getColorBoundsRect(
  source: Surface,
  mask: number,
  color: number,
  findColor: boolean = true,
): ColorBoundsRect | null {
  const maskedColor = (color >>> 0) & (mask >>> 0);
  let minX = source.width;
  let minY = source.height;
  let maxX = -1;
  let maxY = -1;

  for (let py = 0; py < source.height; py++) {
    for (let px = 0; px < source.width; px++) {
      const i = (py * source.width + px) * 4;
      const pixel =
        (((source.data[i + 3] << 24) | (source.data[i] << 16) | (source.data[i + 1] << 8) | source.data[i + 2]) >>> 0) &
        (mask >>> 0);
      const matches = pixel === maskedColor;
      if (matches === findColor) {
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
      }
    }
  }

  if (maxX === -1) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}
