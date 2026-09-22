import { convertBitmapAlphaType } from '@flighthq/bitmap/contract';
import { registerImageDecoder } from '@flighthq/image-codec/contract';
import type { DecodedImage, HostDecompressDeflateCapability, ImageDecodeOptions } from '@flighthq/types/contract';

import { createSwfLosslessBitmap } from './swfBitmap';

// Explicit opt-in for the two container-native raster formats SWF carries. Parsing never calls this:
// it emits ordinary EmbeddedImageResourceReference data, and the caller assembles the decoder registry
// before asking the async resource layer to resolve those references.
export function registerSwfImageDecoders(deflate: Readonly<HostDecompressDeflateCapability>): void {
  registerImageDecoder(SWF_LOSSLESS_MIME_TYPE, (bytes, options) =>
    decodeSwfLosslessImage(bytes, false, deflate, options),
  );
  registerImageDecoder(SWF_LOSSLESS_ALPHA_MIME_TYPE, (bytes, options) =>
    decodeSwfLosslessImage(bytes, true, deflate, options),
  );
}

async function decodeSwfLosslessImage(
  bytes: Readonly<Uint8Array>,
  hasAlpha: boolean,
  deflate: Readonly<HostDecompressDeflateCapability>,
  options?: Readonly<ImageDecodeOptions>,
): Promise<DecodedImage> {
  const bitmap = createSwfLosslessBitmap(bytes, hasAlpha, deflate);
  if (bitmap === null) throw new Error('Could not unpack SWF lossless image payload');
  if (hasAlpha && options?.premultiplyAlpha !== true) convertBitmapAlphaType(bitmap, 'straight');
  return { data: bitmap.data, height: bitmap.height, width: bitmap.width };
}

export const SWF_LOSSLESS_ALPHA_MIME_TYPE = 'image/x-swf-lossless-alpha';
export const SWF_LOSSLESS_MIME_TYPE = 'image/x-swf-lossless';
