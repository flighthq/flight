import type {
  DecodedImage,
  HostImageDecodeCapabilities,
  HostImageDecodeFormatCapability,
} from '@flighthq/types/contract';

import { detectImageMimeType } from './detectImageMimeType';

export async function decodeImage(
  imageDecode: Readonly<HostImageDecodeCapabilities>,
  bytes: Readonly<Uint8Array>,
  mimeType?: string,
): Promise<DecodedImage | null> {
  const slot = resolveDecodeSlot(imageDecode, bytes, mimeType);
  if (slot === null) return null;
  return slot.decode(bytes);
}

export async function decodeImagePremultiplied(
  imageDecode: Readonly<HostImageDecodeCapabilities>,
  bytes: Readonly<Uint8Array>,
  mimeType?: string,
): Promise<DecodedImage | null> {
  const slot = resolveDecodeSlot(imageDecode, bytes, mimeType);
  if (slot === null) return null;
  return slot.decode(bytes, { premultiplyAlpha: true });
}

function resolveDecodeSlot(
  imageDecode: Readonly<HostImageDecodeCapabilities>,
  bytes: Readonly<Uint8Array>,
  mimeType?: string,
): HostImageDecodeFormatCapability | null {
  const type = mimeType ?? detectImageMimeType(bytes);
  if (type === null) return null;
  return getImageDecodeSlot(imageDecode, type);
}

function getImageDecodeSlot(
  imageDecode: Readonly<HostImageDecodeCapabilities>,
  mimeType: string,
): HostImageDecodeFormatCapability | null {
  switch (mimeType) {
    case 'image/avif':
      return imageDecode.avif ?? null;
    case 'image/bmp':
      return imageDecode.bmp ?? null;
    case 'image/gif':
      return imageDecode.gif ?? null;
    case 'image/jpeg':
      return imageDecode.jpeg ?? null;
    case 'image/png':
      return imageDecode.png ?? null;
    case 'image/webp':
      return imageDecode.webp ?? null;
    default:
      return null;
  }
}
