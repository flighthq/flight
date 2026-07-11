import type { DecodedImage, ImageEncodeOptions } from '@flighthq/types';

import { getImageEncoder } from './imageEncoderRegistry';

// Encodes raw RGBA pixels to bytes of the given MIME type via the registered encoder. Returns null when
// no encoder is registered for the type.
export async function encodeImage(
  image: Readonly<DecodedImage>,
  mimeType: string,
  options?: Readonly<ImageEncodeOptions>,
): Promise<Uint8Array | null> {
  const encoder = getImageEncoder(mimeType);
  if (encoder === null) return null;
  return encoder(image, options);
}
