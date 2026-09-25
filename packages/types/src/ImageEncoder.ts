import type { DecodedImage } from './DecodedImage.ts';
import type { ImageEncodeOptions } from './ImageEncodeOptions.ts';

// A per-format image encoder: turns raw RGBA pixels back into encoded bytes (Uint8Array). DOM-free by
// contract — the web/canvas implementation is one swappable backend.
export type ImageEncoder = (
  image: Readonly<DecodedImage>,
  options?: Readonly<ImageEncodeOptions>,
) => Promise<Uint8Array>;
