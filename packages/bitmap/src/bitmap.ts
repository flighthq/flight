import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { AlphaType, Bitmap } from '@flighthq/types/contract';
import { BitmapTextureSourceKind } from '@flighthq/types/contract';

export function cloneBitmap(source: Readonly<Bitmap>): Bitmap {
  const out = allocateEntity<Bitmap>();
  out.alphaType = source.alphaType;
  out.gamut = source.gamut;
  out.data = new Uint8ClampedArray(source.data);
  out.format = source.format;
  out.height = source.height;
  out.kind = source.kind;
  out.version = 0;
  out.width = source.width;
  return finishEntity(out);
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
  const out = allocateEntity<Bitmap>();
  out.alphaType = 'straight';
  out.gamut = 'srgb' as const;
  out.data = data;
  out.format = 'rgba8unorm';
  out.height = height;
  out.kind = BitmapTextureSourceKind;
  out.version = 0;
  out.width = width;
  return finishEntity(out);
}

export function invalidateBitmap(bitmap: Bitmap): void {
  bitmap.version = (bitmap.version + 1) >>> 0;
}
