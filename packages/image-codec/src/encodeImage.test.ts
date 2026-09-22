import type {
  DecodedImage,
  HostImageEncodeCapabilities,
  HostImageEncodeFormatCapability,
} from '@flighthq/types/contract';
import { vi } from 'vitest';

import { encodeImage } from './encodeImage';

function fakeImage(): DecodedImage {
  return { data: new Uint8ClampedArray([1, 2, 3, 4]), width: 1, height: 1 };
}

function fakeSlot(result: Uint8Array = new Uint8Array(0)): HostImageEncodeFormatCapability {
  return { encode: vi.fn(async () => result) };
}

describe('encodeImage', () => {
  it('dispatches to the capability slot and returns its bytes', async () => {
    const bytes = new Uint8Array([9, 8, 7]);
    const slot = fakeSlot(bytes);
    const caps: HostImageEncodeCapabilities = { png: slot };
    const image = fakeImage();
    const result = await encodeImage(caps, image, 'image/png');
    expect(result).toBe(bytes);
    expect(slot.encode).toHaveBeenCalledWith(image, undefined);
  });

  it('forwards encode options to the slot', async () => {
    const slot = fakeSlot();
    const caps: HostImageEncodeCapabilities = { jpeg: slot };
    const image = fakeImage();
    await encodeImage(caps, image, 'image/jpeg', { quality: 0.5 });
    expect(slot.encode).toHaveBeenCalledWith(image, { quality: 0.5 });
  });

  it('returns null when no slot is present for the MIME type', async () => {
    expect(await encodeImage({}, fakeImage(), 'image/png')).toBeNull();
  });
});
