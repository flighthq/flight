import type { HostImageDecodeCapabilities, ImageDecodeFailureExplanation } from '@flighthq/types/contract';

import { detectImageMimeType } from './detectImageMimeType';

export function explainImageDecodeFailure(
  imageDecode: Readonly<HostImageDecodeCapabilities>,
  bytes: Readonly<Uint8Array>,
  mimeType?: string,
): ImageDecodeFailureExplanation | null {
  const type = mimeType ?? detectImageMimeType(bytes);
  if (type === null) return { mimeType: null, reason: 'mime-type-undetected' };
  if (getDecodeSlotPresent(imageDecode, type)) return null;
  return { mimeType: type, reason: 'decoder-not-registered' };
}

function getDecodeSlotPresent(imageDecode: Readonly<HostImageDecodeCapabilities>, mimeType: string): boolean {
  switch (mimeType) {
    case 'image/avif':
      return imageDecode.avif !== undefined;
    case 'image/bmp':
      return imageDecode.bmp !== undefined;
    case 'image/gif':
      return imageDecode.gif !== undefined;
    case 'image/jpeg':
      return imageDecode.jpeg !== undefined;
    case 'image/png':
      return imageDecode.png !== undefined;
    case 'image/webp':
      return imageDecode.webp !== undefined;
    default:
      return false;
  }
}
