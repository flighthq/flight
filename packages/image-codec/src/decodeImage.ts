import type { DecodedImage, ImageDecoder } from '@flighthq/types';

import { detectImageMimeType } from './detectImageMimeType';
import { getImageDecoder } from './imageDecoderRegistry';

// Decodes encoded image bytes to straight (non-premultiplied) RGBA. Resolves the MIME type via
// detectImageMimeType when mimeType is omitted, then dispatches to the registered decoder. Returns null
// when the type cannot be determined or no decoder is registered for it.
export async function decodeImage(bytes: Readonly<Uint8Array>, mimeType?: string): Promise<DecodedImage | null> {
  const decoder = resolveImageDecoder(bytes, mimeType);
  if (decoder === null) return null;
  return decoder(bytes);
}

// As decodeImage, but requests premultiplied RGBA via the decoder's premultiplyAlpha option. A decoder
// that can premultiply in one pass does so; the web/canvas decoder falls back to a JS premultiply pass.
export async function decodeImagePremultiplied(
  bytes: Readonly<Uint8Array>,
  mimeType?: string,
): Promise<DecodedImage | null> {
  const decoder = resolveImageDecoder(bytes, mimeType);
  if (decoder === null) return null;
  return decoder(bytes, { premultiplyAlpha: true });
}

function resolveImageDecoder(bytes: Readonly<Uint8Array>, mimeType?: string): ImageDecoder | null {
  const type = mimeType ?? detectImageMimeType(bytes);
  if (type === null) return null;
  return getImageDecoder(type);
}
