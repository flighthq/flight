import type { DecodedImage } from './DecodedImage';
import type { ImageEncodeOptions } from './ImageEncodeOptions';

// A per-format image encoder: turns raw RGBA pixels back into encoded bytes (Uint8Array). Registered by
// MIME type via registerImageEncoder and dispatched through encodeImage. DOM-free by contract — the
// web/canvas implementation is one swappable backend.
export type ImageEncoder = (
  image: Readonly<DecodedImage>,
  options?: Readonly<ImageEncodeOptions>,
) => Promise<Uint8Array>;
