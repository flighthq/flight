import type { HostImageSource } from './HostImageSource';
import type { TextureSource } from './TextureSource';
import type { TextureSourceKind } from './TextureSourceKind';

/**
 * A flat host-drawable image asset. ImageResource, Bitmap, and CompressedImage are sibling
 * TextureSource variants; renderers dispatch them by `kind` and never inspect nullable alternate
 * representations.
 */
export interface ImageResource extends TextureSource {
  /**
   * Open Texture resolver-registry key declared by the loader that owns this backing. Ordinary
   * images use `image`; streaming video uses `video`; vendor families prefix
   * their values. Dispatch never inspects the opaque host source to infer this value.
   */
  kind: TextureSourceKind;
  /** Borrowed host representation uploaded or drawn directly (image, canvas, ImageBitmap, …). */
  readonly source: HostImageSource;
}
