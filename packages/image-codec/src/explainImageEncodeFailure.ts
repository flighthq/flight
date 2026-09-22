import type { HostImageEncodeCapabilities, ImageEncodeFailureExplanation } from '@flighthq/types/contract';

export function explainImageEncodeFailure(
  imageEncode: Readonly<HostImageEncodeCapabilities>,
  mimeType: string,
): ImageEncodeFailureExplanation | null {
  if (getEncodeSlotPresent(imageEncode, mimeType)) return null;
  return { mimeType, reason: 'encoder-not-registered' };
}

function getEncodeSlotPresent(imageEncode: Readonly<HostImageEncodeCapabilities>, mimeType: string): boolean {
  switch (mimeType) {
    case 'image/jpeg':
      return imageEncode.jpeg !== undefined;
    case 'image/png':
      return imageEncode.png !== undefined;
    case 'image/webp':
      return imageEncode.webp !== undefined;
    default:
      return false;
  }
}
