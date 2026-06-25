import { createEntity } from '@flighthq/entity';
import type { RectangleLike, Surface, SurfaceEdgeMode } from '@flighthq/types';

/**
 * Allocates a new `Surface` containing the pixels of `source` cropped to
 * `rect`. `rect` coordinates are relative to the `source` surface origin
 * (not to a region offset). Pixels of `rect` that fall outside the surface
 * are filled with transparent black.
 *
 * Returns a new `Surface` with the same `colorSpace`, `alphaType`, and
 * `format` as `source`, with dimensions equal to `rect.width × rect.height`.
 */
export function cropSurface(source: Readonly<Surface>, rect: Readonly<RectangleLike>): Surface {
  const sw = source.width;
  const sh = source.height;
  const rx = Math.round(rect.x);
  const ry = Math.round(rect.y);
  const rw = Math.max(0, Math.round(rect.width));
  const rh = Math.max(0, Math.round(rect.height));
  const data = new Uint8ClampedArray(rw * rh * 4);
  const sd = source.data;
  for (let py = 0; py < rh; py++) {
    const sy = ry + py;
    if (sy < 0 || sy >= sh) continue;
    for (let px = 0; px < rw; px++) {
      const sx = rx + px;
      if (sx < 0 || sx >= sw) continue;
      const si = (sy * sw + sx) * 4;
      const di = (py * rw + px) * 4;
      data[di] = sd[si];
      data[di + 1] = sd[si + 1];
      data[di + 2] = sd[si + 2];
      data[di + 3] = sd[si + 3];
    }
  }
  return createEntity({
    alphaType: source.alphaType,
    colorSpace: source.colorSpace,
    data,
    format: source.format,
    height: rh,
    source: null,
    version: 0,
    width: rw,
  });
}

/**
 * Allocates a new `Surface` with `source` padded by `left`, `top`, `right`,
 * and `bottom` pixels on each side. Added pixels are filled according to
 * `edgeMode`:
 * - `'transparent'` (default): filled with transparent black.
 * - `'clamp'`: border pixels of `source` are repeated.
 * - `'wrap'`: `source` is tiled.
 * - `'mirror'`: `source` is mirrored at the edges.
 *
 * When `edgeMode` is `'transparent'`, the optional `fillColor` (packed RGBA,
 * e.g. `0xffffffff` for opaque white) overrides the default transparent fill.
 * It is ignored for all other edge modes.
 */
export function extendSurface(
  source: Readonly<Surface>,
  left: number,
  top: number,
  right: number,
  bottom: number,
  edgeMode: SurfaceEdgeMode = 'transparent',
  fillColor = 0,
): Surface {
  const sw = source.width;
  const sh = source.height;
  const dw = sw + left + right;
  const dh = sh + top + bottom;
  const data = new Uint8ClampedArray(dw * dh * 4);
  const sd = source.data;
  const fr = (fillColor >>> 24) & 0xff;
  const fg = (fillColor >> 16) & 0xff;
  const fb = (fillColor >> 8) & 0xff;
  const fa = fillColor & 0xff;
  for (let py = 0; py < dh; py++) {
    for (let px = 0; px < dw; px++) {
      const sx = px - left;
      const sy = py - top;
      const di = (py * dw + px) * 4;
      if (sx >= 0 && sx < sw && sy >= 0 && sy < sh) {
        const si = (sy * sw + sx) * 4;
        data[di] = sd[si];
        data[di + 1] = sd[si + 1];
        data[di + 2] = sd[si + 2];
        data[di + 3] = sd[si + 3];
      } else {
        const cx = resolveEdge(sx, sw, edgeMode);
        const cy = resolveEdge(sy, sh, edgeMode);
        if (cx !== null && cy !== null) {
          const si = (cy * sw + cx) * 4;
          data[di] = sd[si];
          data[di + 1] = sd[si + 1];
          data[di + 2] = sd[si + 2];
          data[di + 3] = sd[si + 3];
        } else {
          data[di] = fr;
          data[di + 1] = fg;
          data[di + 2] = fb;
          data[di + 3] = fa;
        }
      }
    }
  }
  return createEntity({
    alphaType: source.alphaType,
    colorSpace: source.colorSpace,
    data,
    format: source.format,
    height: dh,
    source: null,
    version: 0,
    width: dw,
  });
}

/**
 * Allocates a new `Surface` with the transparent border of `source` removed.
 * Finds the tightest bounding box of all pixels with alpha > 0 and returns a
 * new surface cropped to that box. If the entire surface is transparent,
 * returns a 1×1 transparent surface.
 */
export function trimSurface(source: Readonly<Surface>): Surface {
  const sw = source.width;
  const sh = source.height;
  const sd = source.data;
  let minX = sw;
  let minY = sh;
  let maxX = -1;
  let maxY = -1;
  for (let py = 0; py < sh; py++) {
    for (let px = 0; px < sw; px++) {
      const a = sd[(py * sw + px) * 4 + 3];
      if (a > 0) {
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
      }
    }
  }
  if (maxX < 0) {
    return createEntity({
      alphaType: source.alphaType,
      colorSpace: source.colorSpace,
      data: new Uint8ClampedArray(4),
      format: source.format,
      height: 1,
      source: null,
      version: 0,
      width: 1,
    });
  }
  return cropSurface(source, { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 });
}

function resolveEdge(v: number, size: number, mode: SurfaceEdgeMode): number | null {
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
      // 'transparent'
      return null;
  }
}
