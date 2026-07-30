import type { HostImageSource } from './HostImageSource';
import type { TextureSource } from './TextureSource';
import type { ImageTextureSourceKind } from './TextureSourceKind';

/**
 * A flat host-drawable image asset. Image, Bitmap, and CompressedImage are sibling
 * TextureSource variants; renderers dispatch them by `kind` and never inspect nullable alternate
 * representations.
 */
export interface Image extends TextureSource {
  /** Image TextureSource registry key. */
  readonly kind: typeof ImageTextureSourceKind;
  /** Borrowed host representation uploaded or drawn directly (image, canvas, ImageBitmap, …). */
  readonly source: HostImageSource;
}
