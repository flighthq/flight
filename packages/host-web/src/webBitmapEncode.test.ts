import {
  encodeBitmap,
  explainBitmapEncodeBackend,
  getBitmapEncodeBackend,
  hasBitmapEncodeHostBackend,
  resetBitmapEncodeBackendForTest,
  setBitmapEncodeBackend,
} from '@flighthq/bitmap/contract';
import { createEntity } from '@flighthq/entity/contract';
import type { Bitmap, BitmapEncodeBackend } from '@flighthq/types/contract';
import { BitmapTextureSourceKind } from '@flighthq/types/contract';

import { enableHostWebBitmapEncode } from './webBitmapEncode';

function createTestBitmap(): Bitmap {
  return createEntity({
    alphaType: 'straight',
    gamut: 'srgb',
    data: new Uint8ClampedArray([1, 2, 3, 4, 5, 6, 7, 8]),
    format: 'rgba8unorm',
    height: 1,
    kind: BitmapTextureSourceKind,
    version: 0,
    width: 2,
  });
}

afterEach(() => {
  resetBitmapEncodeBackendForTest();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('enableHostWebBitmapEncode', () => {
  it('enables without allocating a canvas or ImageData', () => {
    const createElement = vi.spyOn(document, 'createElement');
    const imageData = globalThis.ImageData;
    const imageDataAccess = vi.fn(() => imageData);
    Object.defineProperty(globalThis, 'ImageData', { configurable: true, get: imageDataAccess });
    try {
      enableHostWebBitmapEncode();
      expect(hasBitmapEncodeHostBackend()).toBe(true);
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
    // The DOM declaration combines 2D and WebGPU overloads; this partial mock implements only the
    // 2D member exercised by the encoder, so neither overloaded return type can express it directly.
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

    const source = createTestBitmap();
    const originalPixels = [...source.data];
    enableHostWebBitmapEncode();
    expect(encodeBitmap(source, format, 0.6)).toEqual(new Uint8Array([1, 2, 3]));
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
    expect(explainBitmapEncodeBackend()).toMatchObject({ operation: 'encodeBitmap', viability: 'available' });
  });

  it('records and rethrows genuine web encoding faults', () => {
    const failure = new Error('canvas unavailable');
    vi.spyOn(document, 'createElement').mockImplementation(() => {
      throw failure;
    });
    enableHostWebBitmapEncode();
    expect(() => encodeBitmap(createTestBitmap())).toThrow(failure);
    expect(explainBitmapEncodeBackend()).toMatchObject({
      operation: 'encodeBitmap',
      viability: 'runtime-api-unavailable',
    });
  });

  it('installs a hidden host beneath a terminal custom result without touching the DOM', () => {
    const custom: BitmapEncodeBackend = {
      encodeBitmap: vi.fn(() => new Uint8Array([7])),
      supportedFormats: ['png'],
    };
    const createElement = vi.spyOn(document, 'createElement');
    setBitmapEncodeBackend(custom);
    enableHostWebBitmapEncode();
    expect(hasBitmapEncodeHostBackend()).toBe(true);
    expect(encodeBitmap(createTestBitmap(), 'jpeg')).toBeNull();
    expect(custom.encodeBitmap).not.toHaveBeenCalled();
    expect(createElement).not.toHaveBeenCalled();
  });

  it('preserves host identity on repeat and creates a fresh host after reset', () => {
    enableHostWebBitmapEncode();
    const first = getBitmapEncodeBackend();
    enableHostWebBitmapEncode();
    expect(getBitmapEncodeBackend()).toBe(first);
    resetBitmapEncodeBackendForTest();
    enableHostWebBitmapEncode();
    expect(getBitmapEncodeBackend()).not.toBe(first);
  });
});
