import { createBitmap } from './bitmap';
import { extractBitmapPixels } from './bitmapComposite';
import { drawBitmap } from './bitmapDraw';
import { setBitmapPixel } from './bitmapPixel';

function region(bitmap: ReturnType<typeof createBitmap>, x = 0, y = 0, width = bitmap.width, height = bitmap.height) {
  return { bitmap, x, y, width, height };
}

function readExtractedPixel(buf: Uint8ClampedArray, regionWidth: number, x: number, y: number): number {
  const i = (y * regionWidth + x) * 4;
  return ((buf[i] << 24) | (buf[i + 1] << 16) | (buf[i + 2] << 8) | buf[i + 3]) >>> 0;
}

function guardGlobalImageDataAccess() {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'ImageData');
  let accesses = 0;
  Object.defineProperty(globalThis, 'ImageData', {
    configurable: true,
    get() {
      accesses++;
      throw new Error('global ImageData must not be accessed');
    },
  });
  return {
    get accesses() {
      return accesses;
    },
    restore() {
      if (descriptor === undefined) Reflect.deleteProperty(globalThis, 'ImageData');
      else Object.defineProperty(globalThis, 'ImageData', descriptor);
    },
  };
}

describe('drawBitmap', () => {
  it('allocates through one destination context and puts the exact extracted pixels at the caller coordinates', () => {
    const src = createBitmap(2, 1);
    setBitmapPixel(src, 0, 0, 0x112233ff);
    setBitmapPixel(src, 1, 0, 0xaabbccdd);
    const imageData = {
      colorSpace: 'srgb',
      data: new Uint8ClampedArray(8),
      height: 1,
      width: 2,
    } as ImageData;
    const createImageData = vi.fn(() => imageData);
    const putImageData = vi.fn();
    const getContext = vi.fn(() => ({ createImageData, putImageData }));
    const canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'getContext', { configurable: true, value: getContext });
    const globalImageData = guardGlobalImageDataAccess();

    try {
      drawBitmap(canvas, region(src), 7, -3);
      expect(getContext).toHaveBeenCalledOnce();
      expect(getContext).toHaveBeenCalledWith('2d');
      expect(createImageData).toHaveBeenCalledOnce();
      expect(createImageData).toHaveBeenCalledWith(2, 1);
      expect(Array.from(imageData.data)).toEqual([17, 34, 51, 255, 170, 187, 204, 221]);
      expect(putImageData).toHaveBeenCalledOnce();
      expect(putImageData).toHaveBeenCalledWith(imageData, 7, -3);
      expect(globalImageData.accesses).toBe(0);
    } finally {
      globalImageData.restore();
    }
  });

  it('extracts correct pixels from a filled source', () => {
    const src = createBitmap(4, 4, 0xff0000ff);
    const r = region(src);
    const buf = new Uint8ClampedArray(r.width * r.height * 4);
    extractBitmapPixels(buf, r);
    expect(readExtractedPixel(buf, r.width, 0, 0)).toBe(0xff0000ff);
    expect(readExtractedPixel(buf, r.width, 3, 3)).toBe(0xff0000ff);
  });

  it('extracts correct pixels from a sub-region', () => {
    const src = createBitmap(4, 4);
    setBitmapPixel(src, 1, 1, 0xaabbccdd);
    setBitmapPixel(src, 2, 2, 0x11223344);
    const r = region(src, 1, 1, 2, 2);
    const buf = new Uint8ClampedArray(r.width * r.height * 4);
    extractBitmapPixels(buf, r);
    expect(readExtractedPixel(buf, r.width, 0, 0)).toBe(0xaabbccdd);
    expect(readExtractedPixel(buf, r.width, 1, 1)).toBe(0x11223344);
  });

  it('extracts zeroes from an empty bitmap', () => {
    const src = createBitmap(2, 2);
    const r = region(src);
    const buf = new Uint8ClampedArray(r.width * r.height * 4);
    extractBitmapPixels(buf, r);
    expect(readExtractedPixel(buf, r.width, 0, 0)).toBe(0x00000000);
    expect(readExtractedPixel(buf, r.width, 1, 1)).toBe(0x00000000);
  });

  it.each([
    ['width', 0, 1],
    ['height', 1, 0],
  ] as const)('is a no-op for a zero %s before context, allocation, extraction, or put', (_axis, width, height) => {
    const src = createBitmap(2, 2, 0x112233ff);
    const sourceData = src.data;
    let sourceDataAccesses = 0;
    Object.defineProperty(src, 'data', {
      configurable: true,
      get() {
        sourceDataAccesses++;
        return sourceData;
      },
    });
    const createImageData = vi.fn();
    const putImageData = vi.fn();
    const getContext = vi.fn(() => ({ createImageData, putImageData }));
    const canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'getContext', { configurable: true, value: getContext });
    const globalImageData = guardGlobalImageDataAccess();

    try {
      expect(() => drawBitmap(canvas, region(src, 0, 0, width, height), 0, 0)).not.toThrow();
      expect(getContext).not.toHaveBeenCalled();
      expect(createImageData).not.toHaveBeenCalled();
      expect(putImageData).not.toHaveBeenCalled();
      expect(sourceDataAccesses).toBe(0);
      expect(globalImageData.accesses).toBe(0);
    } finally {
      globalImageData.restore();
    }
  });

  it('throws from a null positive-size context before allocation, extraction, or put', () => {
    const src = createBitmap(1, 1, 0x112233ff);
    const sourceData = src.data;
    let sourceDataAccesses = 0;
    Object.defineProperty(src, 'data', {
      configurable: true,
      get() {
        sourceDataAccesses++;
        return sourceData;
      },
    });
    const getContext = vi.fn(() => null);
    const canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'getContext', { configurable: true, value: getContext });
    const globalImageData = guardGlobalImageDataAccess();
    const createImageData = vi.spyOn(CanvasRenderingContext2D.prototype, 'createImageData');
    const putImageData = vi.spyOn(CanvasRenderingContext2D.prototype, 'putImageData');

    try {
      expect(() => drawBitmap(canvas, region(src), 0, 0)).toThrow();
      expect(getContext).toHaveBeenCalledOnce();
      expect(getContext).toHaveBeenCalledWith('2d');
      expect(createImageData).not.toHaveBeenCalled();
      expect(putImageData).not.toHaveBeenCalled();
      expect(sourceDataAccesses).toBe(0);
      expect(globalImageData.accesses).toBe(0);
    } finally {
      createImageData.mockRestore();
      putImageData.mockRestore();
      globalImageData.restore();
    }
  });
});
