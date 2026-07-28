import type { AlphaType } from './AlphaType';
import type { ImageBacking } from './ImageBacking';
import type { PixelFormat } from './PixelFormat';
import type { BitmapTextureBackingKind } from './TextureBackingKind';

/**
 * Mutable, CPU-readable pixel bytes. Bitmap is a sibling of ImageResource rather than a subtype:
 * converting between raw pixels and a host-drawable image is an explicit allocating operation.
 */
export interface Bitmap extends ImageBacking {
  alphaType: AlphaType;
  readonly colorSpace: 'srgb' | 'display-p3';
  /** Transitional fused-shape field; always null and removed after resolver migration. */
  readonly compressed: null;
  readonly data: Uint8ClampedArray<ArrayBuffer>;
  format: PixelFormat;
  readonly kind: typeof BitmapTextureBackingKind;
  /** Transitional fused-shape field; always null and removed after resolver migration. */
  readonly source: null;
}
