import type {
  DecodedImage,
  HostImageDecodeCapabilities,
  HostImageDecodeFormatCapability,
} from '@flighthq/types/contract';
import { vi } from 'vitest';

import { decodeImage, decodeImagePremultiplied } from './decodeImage.ts';

const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function fakeDecoded(): DecodedImage {
  return { data: new Uint8ClampedArray([1, 2, 3, 4]), width: 1, height: 1 };
}

function fakeSlot(): HostImageDecodeFormatCapability {
  return { decode: vi.fn(async () => fakeDecoded()) };
}

describe('decodeImage', () => {
  it('auto-detects the MIME type when omitted and dispatches to the capability slot', async () => {
    const slot = fakeSlot();
    const caps: HostImageDecodeCapabilities = { png: slot };
    const result = await decodeImage(caps, pngBytes);
    expect(result).toEqual(fakeDecoded());
    expect(slot.decode).toHaveBeenCalledWith(pngBytes);
  });

  it('uses an explicit MIME type over detection', async () => {
    const slot = fakeSlot();
    const caps: HostImageDecodeCapabilities = { jpeg: slot };
    await decodeImage(caps, pngBytes, 'image/jpeg');
    expect(slot.decode).toHaveBeenCalledOnce();
  });

  it('returns null when no slot is present for the detected type', async () => {
    expect(await decodeImage({}, pngBytes)).toBeNull();
  });

  it('returns null when the MIME type cannot be determined', async () => {
    const caps: HostImageDecodeCapabilities = { png: fakeSlot() };
    expect(await decodeImage(caps, new Uint8Array([0, 1, 2, 3]))).toBeNull();
  });

  it('does not request premultiplied output', async () => {
    const slot = fakeSlot();
    const caps: HostImageDecodeCapabilities = { png: slot };
    await decodeImage(caps, pngBytes);
    expect(slot.decode).toHaveBeenCalledWith(pngBytes);
  });
});

describe('decodeImagePremultiplied', () => {
  it('passes premultiplyAlpha true to the slot', async () => {
    const slot = fakeSlot();
    const caps: HostImageDecodeCapabilities = { png: slot };
    await decodeImagePremultiplied(caps, pngBytes, 'image/png');
    expect(slot.decode).toHaveBeenCalledWith(pngBytes, { premultiplyAlpha: true });
  });

  it('auto-detects the MIME type when omitted', async () => {
    const slot = fakeSlot();
    const caps: HostImageDecodeCapabilities = { png: slot };
    expect(await decodeImagePremultiplied(caps, pngBytes)).toEqual(fakeDecoded());
    expect(slot.decode).toHaveBeenCalledWith(pngBytes, { premultiplyAlpha: true });
  });

  it('returns null when no slot is present for the detected type', async () => {
    expect(await decodeImagePremultiplied({}, pngBytes)).toBeNull();
  });
});
