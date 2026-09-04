import { encodeBitmap } from '@flighthq/bitmap/contract';
import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { Bitmap, HasGraphicsBitmapEncode } from '@flighthq/types/contract';
import { BitmapTextureSourceKind } from '@flighthq/types/contract';

import {
  createWebBitmapEncodeBackend,
  initializeWebBitmapEncodeBackend,
  webBitmapEncodeBackend,
} from './webBitmapEncode';

function createTestBitmap(): Bitmap {
  const out = allocateEntity<Bitmap>();
  out.alphaType = 'straight';
  out.gamut = 'srgb';
  out.data = new Uint8ClampedArray([1, 2, 3, 4, 5, 6, 7, 8]);
  out.format = 'rgba8unorm';
  out.height = 1;
  out.kind = BitmapTextureSourceKind;
  out.version = 0;
  out.width = 2;
  return finishEntity(out);
}

function hostWith(backend = webBitmapEncodeBackend): HasGraphicsBitmapEncode {
  return { graphics: { bitmapEncode: backend } } as HasGraphicsBitmapEncode;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('createWebBitmapEncodeBackend', () => {
  it('returns a fresh entity each call', () => {
    const a = createWebBitmapEncodeBackend();
    const b = createWebBitmapEncodeBackend();
    expect(a).not.toBe(b);
    expect(a.supportedFormats).toEqual(['jpeg', 'png']);
  });
});

describe('initializeWebBitmapEncodeBackend', () => {
  it('is the construction initializer of createWebBitmapEncodeBackend', () => {
    expect(typeof initializeWebBitmapEncodeBackend).toBe('function');
  });
});
describe('webBitmapEncodeBackend', () => {
  it('does not allocate a canvas or ImageData at import time', () => {
    const createElement = vi.spyOn(document, 'createElement');
    const imageData = globalThis.ImageData;
    const imageDataAccess = vi.fn(() => imageData);
    Object.defineProperty(globalThis, 'ImageData', { configurable: true, get: imageDataAccess });
    try {
      expect(webBitmapEncodeBackend.supportedFormats).toEqual(['jpeg', 'png']);
      expect(createElement).not.toHaveBeenCalled();
      expect(imageDataAccess).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(globalThis, 'ImageData', { configurable: true, value: imageData });
    }
  });

  it.each([
    ['png', 'image/png'],
    ['jpeg', 'image/jpeg'],
  ] as const)('encodes %s through exact web pixel and data-url semantics', (format, mimeType) => {
    const putImageData = vi.fn();
    const createElement = vi.spyOn(document, 'createElement');
    const context = { putImageData } as unknown as CanvasRenderingContext2D;
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(context as unknown as ReturnType<HTMLCanvasElement['getContext']>);
    const toDataURL = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/mock;base64,AQID');

    const createdImageData: Array<{ data: Uint8ClampedArray; height: number; width: number }> = [];
    class MockImageData {
      readonly data: Uint8ClampedArray;
      readonly height: number;
      readonly width: number;

      constructor(width: number, height: number) {
        this.data = new Uint8ClampedArray(width * height * 4);
        this.height = height;
        this.width = width;
        createdImageData.push(this);
      }
    }
    vi.stubGlobal('ImageData', MockImageData);

    const host = hostWith();
    const source = createTestBitmap();
    const originalPixels = [...source.data];
    expect(encodeBitmap(host, source, format, 0.6)).toEqual(new Uint8Array([1, 2, 3]));
    const canvas = createElement.mock.results[0]?.value;
    expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    if (!(canvas instanceof HTMLCanvasElement)) return;
    expect(canvas.width).toBe(2);
    expect(canvas.height).toBe(1);
    expect(getContext).toHaveBeenCalledWith('2d');
    expect(createdImageData).toHaveLength(1);
    expect([...createdImageData[0].data]).toEqual(originalPixels);
    expect(putImageData).toHaveBeenCalledWith(createdImageData[0], 0, 0);
    expect(toDataURL).toHaveBeenCalledWith(mimeType, 0.6);
    expect([...source.data]).toEqual(originalPixels);
  });

  it('rethrows genuine web encoding faults', () => {
    const failure = new Error('canvas unavailable');
    vi.spyOn(document, 'createElement').mockImplementation(() => {
      throw failure;
    });
    const host = hostWith();
    expect(() => encodeBitmap(host, createTestBitmap())).toThrow(failure);
  });
});
