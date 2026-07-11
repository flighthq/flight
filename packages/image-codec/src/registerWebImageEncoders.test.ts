import type { DecodedImage } from '@flighthq/types';
import { vi } from 'vitest';

import { clearImageEncoders, getImageEncoder, hasImageEncoder } from './imageEncoderRegistry';
import { registerWebImageEncoders } from './registerWebImageEncoders';

// node lacks OffscreenCanvas + ImageData; these stand-ins record the convertToBlob call and hand back
// fixed bytes so the encoder's byte extraction can be verified.
const convertToBlobMock = vi.fn(async (_options: { type: string; quality?: number }) => ({
  arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
}));

class MockOffscreenCanvas {
  constructor(
    readonly width: number,
    readonly height: number,
  ) {}

  getContext(): unknown {
    return { putImageData: vi.fn() };
  }

  convertToBlob(options: { type: string; quality?: number }): Promise<{ arrayBuffer: () => Promise<ArrayBuffer> }> {
    return convertToBlobMock(options);
  }
}

function fakeImage(): DecodedImage {
  return { data: new Uint8ClampedArray([10, 20, 30, 255]), width: 1, height: 1 };
}

beforeEach(() => {
  vi.stubGlobal('OffscreenCanvas', MockOffscreenCanvas);
  vi.stubGlobal(
    'ImageData',
    class {
      constructor(
        readonly data: Uint8ClampedArray,
        readonly width: number,
        readonly height: number,
      ) {}
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  convertToBlobMock.mockClear();
  clearImageEncoders();
});

describe('registerWebImageEncoders', () => {
  it('registers an encoder under every browser-encodable MIME type', () => {
    registerWebImageEncoders();
    for (const mimeType of ['image/png', 'image/jpeg', 'image/webp']) {
      expect(hasImageEncoder(mimeType)).toBe(true);
    }
  });

  it('encodes to bytes via convertToBlob under the registered MIME type', async () => {
    registerWebImageEncoders();
    const encoder = getImageEncoder('image/png');
    const bytes = await encoder!(fakeImage());
    expect(Array.from(bytes)).toEqual([1, 2, 3]);
    expect(convertToBlobMock).toHaveBeenCalledWith({ type: 'image/png', quality: undefined });
  });

  it('forwards the quality option to convertToBlob', async () => {
    registerWebImageEncoders();
    const encoder = getImageEncoder('image/jpeg');
    await encoder!(fakeImage(), { quality: 0.7 });
    expect(convertToBlobMock).toHaveBeenCalledWith({ type: 'image/jpeg', quality: 0.7 });
  });
});
