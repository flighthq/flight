import type { BitmapDisplacementMapOptions, BitmapEdgeMode, BitmapRegion } from '@flighthq/types/contract';

/**
 * Warps `source` by sampling each output pixel from a displaced source position,
 * writing into `out`. The displacement for pixel (px, py) is read from `map` at
 * the aligned position and scaled:
 *
 *   dx = (mapValueX / 255 - 0.5) * scaleX
 *   dy = (mapValueY / 255 - 0.5) * scaleY
 *
 * A map value of 128 is approximately neutral (< 0.2px shift). Sampling uses
 * bilinear interpolation.
 *
 * When `edgeMode` is set, it controls out-of-bounds behaviour using the standard
 * `BitmapEdgeMode` values (`'clamp'`, `'wrap'`, `'mirror'`, `'transparent'`).
 * Otherwise `mode` is used: `'wrap'` tiles, `'clamp'` holds the edge, `'ignore'`
 * keeps the undisplaced source pixel, and `'color'` fills with `fillColor`.
 *
 * `out` must be at least `source.width * source.height * 4` bytes and must NOT
 * alias `source.bitmap.data` — output pixels read arbitrary source positions.
 */
export function displaceBitmap(
  out: Uint8ClampedArray,
  source: Readonly<BitmapRegion>,
  options: Readonly<BitmapDisplacementMapOptions>,
): void {
  const w = source.width;
  const h = source.height;
  const map = options.map;
  const componentX = options.componentX ?? 0;
  const componentY = options.componentY ?? 1;
  const scaleX = options.scaleX ?? 0;
  const scaleY = options.scaleY ?? 0;
  const edgeMode = options.edgeMode;
  const mode = options.mode ?? 'wrap';
  const fillColor = options.fillColor ?? 0;
  const fillR = (fillColor >>> 24) & 0xff;
  const fillG = (fillColor >> 16) & 0xff;
  const fillB = (fillColor >> 8) & 0xff;
  const fillA = fillColor & 0xff;

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const di = (py * w + px) * 4;
      const mapVx = sampleMapChannel(map, px, py, componentX);
      const mapVy = sampleMapChannel(map, px, py, componentY);
      const rawSampleX = px + (mapVx / 255 - 0.5) * scaleX;
      const rawSampleY = py + (mapVy / 255 - 0.5) * scaleY;

      let sampleX = rawSampleX;
      let sampleY = rawSampleY;

      if (edgeMode === undefined && (rawSampleX < 0 || rawSampleX >= w || rawSampleY < 0 || rawSampleY >= h)) {
        if (mode === 'wrap') {
          sampleX = ((rawSampleX % w) + w) % w;
          sampleY = ((rawSampleY % h) + h) % h;
        } else if (mode === 'clamp') {
          sampleX = Math.max(0, Math.min(w - 1, rawSampleX));
          sampleY = Math.max(0, Math.min(h - 1, rawSampleY));
        } else if (mode === 'ignore') {
          sampleX = px;
          sampleY = py;
        } else {
          out[di] = fillR;
          out[di + 1] = fillG;
          out[di + 2] = fillB;
          out[di + 3] = fillA;
          continue;
        }
      }

      const x0 = Math.floor(sampleX);
      const y0 = Math.floor(sampleY);
      const tx = sampleX - x0;
      const ty = sampleY - y0;
      const sStride = source.bitmap.width;
      const sData = source.bitmap.data;
      const rx0 = edgeMode === undefined ? Math.max(0, Math.min(w - 1, x0)) : resolveDisplacementEdge(x0, w, edgeMode);
      const rx1 =
        edgeMode === undefined ? Math.max(0, Math.min(w - 1, x0 + 1)) : resolveDisplacementEdge(x0 + 1, w, edgeMode);
      const ry0 = edgeMode === undefined ? Math.max(0, Math.min(h - 1, y0)) : resolveDisplacementEdge(y0, h, edgeMode);
      const ry1 =
        edgeMode === undefined ? Math.max(0, Math.min(h - 1, y0 + 1)) : resolveDisplacementEdge(y0 + 1, h, edgeMode);
      const i00 = rx0 === null || ry0 === null ? -1 : ((source.y + ry0) * sStride + source.x + rx0) * 4;
      const i10 = rx1 === null || ry0 === null ? -1 : ((source.y + ry0) * sStride + source.x + rx1) * 4;
      const i01 = rx0 === null || ry1 === null ? -1 : ((source.y + ry1) * sStride + source.x + rx0) * 4;
      const i11 = rx1 === null || ry1 === null ? -1 : ((source.y + ry1) * sStride + source.x + rx1) * 4;
      for (let c = 0; c < 4; c++) {
        const top = (i00 < 0 ? 0 : sData[i00 + c]) * (1 - tx) + (i10 < 0 ? 0 : sData[i10 + c]) * tx;
        const bottom = (i01 < 0 ? 0 : sData[i01 + c]) * (1 - tx) + (i11 < 0 ? 0 : sData[i11 + c]) * tx;
        out[di + c] = Math.round(top * (1 - ty) + bottom * ty);
      }
    }
  }
}

function resolveDisplacementEdge(v: number, size: number, mode: BitmapEdgeMode): number | null {
  if (v >= 0 && v < size) return v;
  switch (mode) {
    case 'clamp':
      return Math.max(0, Math.min(size - 1, v));
    case 'wrap':
      return ((v % size) + size) % size;
    case 'mirror': {
      const period = 2 * size;
      const wrapped = ((v % period) + period) % period;
      return wrapped < size ? wrapped : period - 1 - wrapped;
    }
    default:
      return null;
  }
}

function sampleMapChannel(map: Readonly<BitmapRegion>, px: number, py: number, component: number): number {
  const mx = map.x + px;
  const my = map.y + py;
  if (mx < 0 || mx >= map.bitmap.width || my < 0 || my >= map.bitmap.height) return 128;
  return map.bitmap.data[(my * map.bitmap.width + mx) * 4 + component];
}
