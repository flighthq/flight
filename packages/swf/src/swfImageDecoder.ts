import { convertBitmapAlphaType } from '@flighthq/bitmap/contract';
import type { DecodedImage, HostDecompressDeflateCapability, ImageDecodeOptions } from '@flighthq/types/contract';

import { createSwfLosslessBitmap } from './swfBitmap';
import { SWF_LOSSLESS_ALPHA_MIME_TYPE, SWF_LOSSLESS_MIME_TYPE } from './swfImageMimeType';

export async function decodeSwfImage(
  bytes: Readonly<Uint8Array>,
  mimeType: string,
  deflate: Readonly<HostDecompressDeflateCapability>,
  options?: Readonly<ImageDecodeOptions>,
): Promise<DecodedImage | null> {
  switch (mimeType) {
    case SWF_LOSSLESS_MIME_TYPE:
      return decodeSwfLosslessImage(bytes, false, deflate, options);
    case SWF_LOSSLESS_ALPHA_MIME_TYPE:
      return decodeSwfLosslessImage(bytes, true, deflate, options);
    default:
      return null;
  }
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

export { SWF_LOSSLESS_ALPHA_MIME_TYPE, SWF_LOSSLESS_MIME_TYPE } from './swfImageMimeType';
