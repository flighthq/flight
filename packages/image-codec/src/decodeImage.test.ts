import type { DecodedImage, ImageDecodeOptions } from '@flighthq/types';
import { vi } from 'vitest';

import { decodeImage, decodeImagePremultiplied } from './decodeImage';
import { clearImageDecoders, registerImageDecoder } from './imageDecoderRegistry';

// PNG magic bytes so the omitted-mimeType path resolves through detectImageMimeType.
const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function fakeDecoded(): DecodedImage {
  return { data: new Uint8ClampedArray([1, 2, 3, 4]), width: 1, height: 1 };
}

afterEach(() => {
  clearImageDecoders();
});

describe('decodeImage', () => {
  it('auto-detects the MIME type when omitted and dispatches to the registered decoder', async () => {
    const decoder = vi.fn(async () => fakeDecoded());
    registerImageDecoder('image/png', decoder);
    const result = await decodeImage(pngBytes);
    expect(result).toEqual(fakeDecoded());
    expect(decoder).toHaveBeenCalledWith(pngBytes);
  });

  it('uses an explicit MIME type over detection', async () => {
    const decoder = vi.fn(async () => fakeDecoded());
    registerImageDecoder('image/jpeg', decoder);
    await decodeImage(pngBytes, 'image/jpeg');
    expect(decoder).toHaveBeenCalledOnce();
  });

  it('returns null when no decoder is registered', async () => {
    expect(await decodeImage(pngBytes)).toBeNull();
  });

  it('returns null when the MIME type cannot be determined', async () => {
    expect(await decodeImage(new Uint8Array([0, 1, 2, 3]))).toBeNull();
  });

  it('does not request premultiplied output', async () => {
    const decoder = vi.fn(async () => fakeDecoded());
    registerImageDecoder('image/png', decoder);
    await decodeImage(pngBytes);
    expect(decoder).toHaveBeenCalledWith(pngBytes);
  });
});

describe('decodeImagePremultiplied', () => {
  it('passes premultiplyAlpha true to the decoder', async () => {
    const decoder = vi.fn(async (_bytes: Readonly<Uint8Array>, _options?: Readonly<ImageDecodeOptions>) =>
      fakeDecoded(),
    );
    registerImageDecoder('image/png', decoder);
    await decodeImagePremultiplied(pngBytes);
    expect(decoder).toHaveBeenCalledWith(pngBytes, { premultiplyAlpha: true });
  });

  it('returns null when no decoder is registered', async () => {
    expect(await decodeImagePremultiplied(pngBytes)).toBeNull();
  });
});
