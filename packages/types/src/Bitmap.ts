import type { AlphaType } from './AlphaType';
import type { ImageBacking } from './ImageBacking';
import type { PixelFormat } from './PixelFormat';
import type { BitmapTextureBackingKind, ImageTextureBackingKind } from './TextureBackingKind';

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
  /**
   * `image` is retained only while the fused renderer path is still active; Stage 4 moves
   * construction to the distinct `bitmap` resolver key and removes this transitional member.
   */
  readonly kind: typeof BitmapTextureBackingKind | typeof ImageTextureBackingKind;
  /** Transitional fused-shape field; always null and removed after resolver migration. */
  readonly source: null;
}
