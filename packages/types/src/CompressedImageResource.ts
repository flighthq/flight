import type { CompressedImageData } from './CompressedImageData';
import type { TextureSource } from './TextureSource';
import type { CompressedImageTextureSourceKind } from './TextureSourceKind';

/**
 * GPU-only block-compressed image source. The payload remains in its container-native format; it is
 * neither directly drawable by Canvas/DOM nor readable through the Bitmap pixel API.
 */
export interface CompressedImageResource extends TextureSource {
  readonly compressed: CompressedImageData;
  readonly kind: typeof CompressedImageTextureSourceKind;
}
