import type {
  DecodedImage,
  HostImageEncodeCapabilities,
  HostImageEncodeFormatCapability,
  ImageEncodeOptions,
} from '@flighthq/types/contract';

export async function encodeImage(
  imageEncode: Readonly<HostImageEncodeCapabilities>,
  image: Readonly<DecodedImage>,
  mimeType: string,
  options?: Readonly<ImageEncodeOptions>,
): Promise<Uint8Array | null> {
  const slot = getImageEncodeSlot(imageEncode, mimeType);
  if (slot === null) return null;
  return slot.encode(image, options);
}

function getImageEncodeSlot(
  imageEncode: Readonly<HostImageEncodeCapabilities>,
  mimeType: string,
): HostImageEncodeFormatCapability | null {
  switch (mimeType) {
    case 'image/jpeg':
      return imageEncode.jpeg ?? null;
    case 'image/png':
      return imageEncode.png ?? null;
    case 'image/webp':
      return imageEncode.webp ?? null;
    default:
      return null;
  }
}
