import type { AlphaType } from './AlphaType';
import type { PixelFormat } from './PixelFormat';
import type { TextureSource } from './TextureSource';
import type { BitmapTextureSourceKind } from './TextureSourceKind';

/**
 * Mutable, CPU-readable pixel bytes. Bitmap is a sibling of ImageResource rather than a subtype:
 * converting between raw pixels and a host-drawable image is an explicit allocating operation.
 */
export interface Bitmap extends TextureSource {
  alphaType: AlphaType;
  readonly colorSpace: 'srgb' | 'display-p3';
  readonly data: Uint8ClampedArray<ArrayBuffer>;
  format: PixelFormat;
  readonly kind: typeof BitmapTextureSourceKind;
}
