import { createEntity } from '@flighthq/entity/contract';
import type { AlphaType, Bitmap } from '@flighthq/types/contract';
import { BitmapTextureBackingKind } from '@flighthq/types/contract';

export function cloneBitmap(source: Readonly<Bitmap>): Bitmap {
  return createEntity({
    alphaType: source.alphaType,
    colorSpace: source.colorSpace,
    data: new Uint8ClampedArray(source.data),
    format: source.format,
    height: source.height,
    kind: source.kind,
    version: 0,
    width: source.width,
  });
}

/**
 * Converts the alpha representation of `out` in place between `'straight'` and
 * `'premultiplied'`. If `out.alphaType` already matches `target`, this is a
 * no-op (neither pixel data nor the metadata field changes).
 *
 * - `'straight' → 'premultiplied'`: RGB channels are multiplied by alpha/255.
 * - `'premultiplied' → 'straight'`: RGB channels are divided by alpha/255.
 *   Pixels with alpha=0 are left as `(0,0,0,0)`.
 *
 * Updates `out.alphaType` to `target` after conversion.
 */
export function convertBitmapAlphaType(out: Bitmap, target: AlphaType): void {
  if (out.alphaType === target) return;
  const data = out.data;
  const len = out.width * out.height * 4;
  if (target === 'premultiplied') {
    for (let i = 0; i < len; i += 4) {
      const a = data[i + 3] / 255;
      data[i] = Math.round(data[i] * a);
      data[i + 1] = Math.round(data[i + 1] * a);
      data[i + 2] = Math.round(data[i + 2] * a);
    }
  } else {
    for (let i = 0; i < len; i += 4) {
      const a = data[i + 3];
      if (a === 0) {
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
      } else {
        const inv = 255 / a;
        data[i] = Math.min(255, Math.round(data[i] * inv));
        data[i + 1] = Math.min(255, Math.round(data[i + 1] * inv));
        data[i + 2] = Math.min(255, Math.round(data[i + 2] * inv));
      }
    }
  }
  // Mutate the alphaType metadata field.
  out.alphaType = target;
  invalidateBitmap(out);
}

export function createBitmap(width: number, height: number, color: number = 0): Bitmap {
  const data = new Uint8ClampedArray(width * height * 4);
  if (color !== 0) {
    const r = (color >>> 24) & 0xff;
    const g = (color >> 16) & 0xff;
    const b = (color >> 8) & 0xff;
    const a = color & 0xff;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }
  return createEntity({
    alphaType: 'straight',
    colorSpace: 'srgb' as const,
    data,
    format: 'rgba8unorm',
    height,
    kind: BitmapTextureBackingKind,
    version: 0,
    width,
  });
}

export function invalidateBitmap(bitmap: Bitmap): void {
  bitmap.version = (bitmap.version + 1) >>> 0;
}
