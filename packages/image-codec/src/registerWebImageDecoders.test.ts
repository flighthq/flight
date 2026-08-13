import { vi } from 'vitest';

import { clearImageDecoders, getImageDecoder, hasImageDecoder } from './imageDecoderRegistry';
import { registerWebImageDecoders } from './registerWebImageDecoders';

// jsdom / node lack createImageBitmap + OffscreenCanvas + Blob; these minimal stand-ins let the
// canvas decoder run. getImageData always returns straight (non-premultiplied) RGBA, matching the browser.
const straightPixels = [200, 100, 50, 128];
let bitmapCloseMock: ReturnType<typeof vi.fn>;
let createImageBitmapMock: ReturnType<typeof vi.fn>;

class MockBlob {
  constructor(readonly parts: readonly unknown[]) {}
}

class MockOffscreenCanvas {
  constructor(
    readonly width: number,
    readonly height: number,
  ) {}

  getContext(contextId: string): unknown {
    if (contextId !== '2d') return null;
    return {
      drawImage: vi.fn(),
      getImageData: () => ({ data: new Uint8ClampedArray(straightPixels) }),
    };
  }
}

beforeEach(() => {
  bitmapCloseMock = vi.fn();
  createImageBitmapMock = vi.fn(async () => ({ width: 1, height: 1, close: bitmapCloseMock }));
  vi.stubGlobal('createImageBitmap', createImageBitmapMock);
  vi.stubGlobal('OffscreenCanvas', MockOffscreenCanvas);
  vi.stubGlobal('Blob', MockBlob);
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearImageDecoders();
});

describe('registerWebImageDecoders', () => {
  it('registers a decoder under every browser-decodable MIME type', () => {
    registerWebImageDecoders();
    for (const mimeType of ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif', 'image/bmp']) {
      expect(hasImageDecoder(mimeType)).toBe(true);
    }
  });

  it('decodes to straight (non-premultiplied) RGBA', async () => {
    registerWebImageDecoders();
    const decoder = getImageDecoder('image/png');
    const result = await decoder!(new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
    expect(result.width).toBe(1);
    expect(result.height).toBe(1);
    expect(Array.from(result.data)).toEqual(straightPixels);
    expect(bitmapCloseMock).toHaveBeenCalledOnce();
  });

  it('forwards only the bytes inside the supplied view to createImageBitmap', async () => {
    registerWebImageDecoders();
    const decoder = getImageDecoder('image/png');
    const backing = new Uint8Array([1, 2, 3, 4, 5, 6]);

    await decoder!(backing.subarray(1, 5));

    const blob = createImageBitmapMock.mock.calls[0][0] as MockBlob;
    expect(Array.from(blob.parts[0] as Uint8Array)).toEqual([2, 3, 4, 5]);
  });

  it('premultiplies the straight result when premultiplyAlpha is requested', async () => {
    registerWebImageDecoders();
    const decoder = getImageDecoder('image/png');
    const result = await decoder!(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), { premultiplyAlpha: true });
    // 200*128/255 -> 100, 100*128/255 -> 50, 50*128/255 -> 25, alpha unchanged.
    expect(Array.from(result.data)).toEqual([100, 50, 25, 128]);
  });
});
