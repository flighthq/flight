import type { ImageBacking } from './ImageBacking';
import type { ImageResourceCompressed } from './ImageResourceCompressed';
import type { CompressedImageTextureBackingKind } from './TextureBackingKind';

/**
 * GPU-only block-compressed image backing. The payload remains in its container-native format; it is
 * neither directly drawable by Canvas/DOM nor readable through the Bitmap pixel API.
 */
export interface CompressedImage extends ImageBacking {
  readonly compressed: ImageResourceCompressed;
  readonly kind: typeof CompressedImageTextureBackingKind;
}
