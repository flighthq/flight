import type { DecodedImage } from './DecodedImage';
import type { ImageDecodeOptions } from './ImageDecodeOptions';

// A per-format image decoder: turns encoded bytes (Uint8Array) into raw RGBA pixels. DOM-free by
// contract — the web/canvas implementation is one swappable backend.
export type ImageDecoder = (
  bytes: Readonly<Uint8Array>,
  options?: Readonly<ImageDecodeOptions>,
) => Promise<DecodedImage>;

export type ImageDecodeFallback = (
  bytes: Readonly<Uint8Array>,
  mimeType: string,
  options?: Readonly<ImageDecodeOptions>,
) => Promise<DecodedImage | null>;
