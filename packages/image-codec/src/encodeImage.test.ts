import type { DecodedImage } from '@flighthq/types';
import { vi } from 'vitest';

import { encodeImage } from './encodeImage';
import { clearImageEncoders, registerImageEncoder } from './imageEncoderRegistry';

function fakeImage(): DecodedImage {
  return { data: new Uint8ClampedArray([1, 2, 3, 4]), width: 1, height: 1 };
}

afterEach(() => {
  clearImageEncoders();
});

describe('encodeImage', () => {
  it('dispatches to the registered encoder and returns its bytes', async () => {
    const bytes = new Uint8Array([9, 8, 7]);
    const encoder = vi.fn(async () => bytes);
    registerImageEncoder('image/png', encoder);
    const image = fakeImage();
    const result = await encodeImage(image, 'image/png');
    expect(result).toBe(bytes);
    expect(encoder).toHaveBeenCalledWith(image, undefined);
  });

  it('forwards encode options to the encoder', async () => {
    const encoder = vi.fn(async () => new Uint8Array(0));
    registerImageEncoder('image/jpeg', encoder);
    const image = fakeImage();
    await encodeImage(image, 'image/jpeg', { quality: 0.5 });
    expect(encoder).toHaveBeenCalledWith(image, { quality: 0.5 });
  });

  it('returns null when no encoder is registered', async () => {
    expect(await encodeImage(fakeImage(), 'image/png')).toBeNull();
  });
});
