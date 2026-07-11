import type { DecodedImage } from './DecodedImage';
import type { ImageDecodeOptions } from './ImageDecodeOptions';

// A per-format image decoder: turns encoded bytes (Uint8Array) into raw RGBA pixels. Registered by MIME
// type via registerImageDecoder and dispatched through decodeImage. DOM-free by contract — the web/canvas
// implementation is one swappable backend, a native host swaps in wasm codecs with no API change.
export type ImageDecoder = (
  bytes: Readonly<Uint8Array>,
  options?: Readonly<ImageDecodeOptions>,
) => Promise<DecodedImage>;
