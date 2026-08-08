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

// The image-decode seam realized by the web default (`createWebImageBackend`) and by native hosts. A
// backend turns a URL into a decoded `Image`; `@flighthq/image` dispatches every URL load through it,
// and every other loader in that package — base64, blob, bytes — funnels into the same call, so a host
// replaces one method rather than four.
//
// `crossOrigin` is the DOM attribute's vocabulary because that is what the format of the request is,
// not because the backend must be a DOM one: a native host reads it as the credential mode to use.
// `signal` cancels the load; an aborted load rejects with the signal's reason rather than resolving.
export interface ImageBackend {
  loadImageFromUrl(url: string, crossOrigin?: 'anonymous' | 'use-credentials', signal?: AbortSignal): Promise<Image>;
}
