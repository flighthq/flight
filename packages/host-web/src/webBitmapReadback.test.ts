import { createBitmapFromImageSource, explainBitmapReadback } from '@flighthq/bitmap/contract';
import type { HasGraphicsBitmapReadback } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import { vi } from 'vitest';

import {
  createWebBitmapReadbackBackend,
  initializeWebBitmapReadbackBackend,
  webBitmapReadbackBackend,
} from './webBitmapReadback';

function hostWith(backend: HasGraphicsBitmapReadback['graphics']['bitmapReadback']): HasGraphicsBitmapReadback {
  return { graphics: { bitmapReadback: backend } } as HasGraphicsBitmapReadback;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createWebBitmapReadbackBackend', () => {
  it('returns an Entity', () => {
    expect(EntityRuntimeKey in createWebBitmapReadbackBackend()).toBe(true);
  });

  it('creates an explicit readback operation without touching the DOM', () => {
    const createElement = vi.spyOn(document, 'createElement');

    expect(createWebBitmapReadbackBackend().readBitmap).toEqual(expect.any(Function));
    expect(createElement).not.toHaveBeenCalled();
  });
});

describe('initializeWebBitmapReadbackBackend', () => {
  it('is the construction initializer of createWebBitmapReadbackBackend', () => {
    expect(typeof initializeWebBitmapReadbackBackend).toBe('function');
  });
});
describe('webBitmapReadbackBackend', () => {
  const host = hostWith(webBitmapReadbackBackend);

  it('materializes full pixels only for the constructor path', () => {
    const source = document.createElement('canvas');
    source.width = 8;
    source.height = 4;
    const getImageData = vi.spyOn(CanvasRenderingContext2D.prototype, 'getImageData');

    const bitmap = createBitmapFromImageSource(host, source, 8, 4);

    expect(bitmap).not.toBeNull();
    expect(bitmap!.width).toBe(8);
    expect(bitmap!.height).toBe(4);
    expect(bitmap!.data).toHaveLength(8 * 4 * 4);
    expect(getImageData).toHaveBeenCalledWith(0, 0, 8, 4);
  });

  it('uses one pixel and no Bitmap allocation to explain a large source', () => {
    const source = document.createElement('canvas');
    source.width = 16_384;
    source.height = 8_192;
    const probe = {
      colorSpace: 'srgb',
      get data(): Uint8ClampedArray {
        throw new Error('probe pixels must not be materialized as a Bitmap');
      },
      height: 1,
      width: 1,
    } as unknown as ImageData;
    const getImageData = vi.spyOn(CanvasRenderingContext2D.prototype, 'getImageData').mockReturnValue(probe);
    const drawImage = vi.spyOn(CanvasRenderingContext2D.prototype, 'drawImage');
    const createElement = vi.spyOn(document, 'createElement');

    expect(explainBitmapReadback(host, source, source.width, source.height)).toEqual({
      readable: true,
      reason: 'ok',
    });

    const scratch = createElement.mock.results[0]?.value;
    expect(scratch).toBeInstanceOf(HTMLCanvasElement);
    if (!(scratch instanceof HTMLCanvasElement)) return;
    expect(scratch.width).toBe(1);
    expect(scratch.height).toBe(1);
    expect(drawImage).toHaveBeenCalledOnce();
    expect(drawImage).toHaveBeenCalledWith(source, 0, 0);
    expect(getImageData).toHaveBeenCalledOnce();
    expect(getImageData).toHaveBeenCalledWith(0, 0, 1, 1);
  });

  it('reports exact expected Web failures', () => {
    const source = document.createElement('canvas');
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(null as ReturnType<HTMLCanvasElement['getContext']>);

    expect(explainBitmapReadback(host, source, 8, 4)).toEqual({ readable: false, reason: 'no-canvas' });
    getContext.mockRestore();

    const getImageData = vi.spyOn(CanvasRenderingContext2D.prototype, 'getImageData').mockImplementation(() => {
      throw new DOMException('Tainted canvases may not be exported.', 'SecurityError');
    });
    expect(explainBitmapReadback(host, source, 8, 4)).toEqual({ readable: false, reason: 'tainted-source' });
    expect(createBitmapFromImageSource(host, source, 8, 4)).toBeNull();
    getImageData.mockRestore();
  });

  it('lets a full-read allocation fault propagate after a successful one-pixel explanation', () => {
    const source = document.createElement('canvas');
    const onePixel = source.getContext('2d')!.getImageData(0, 0, 1, 1);
    const fault = new RangeError('full bitmap allocation failed');
    vi.spyOn(CanvasRenderingContext2D.prototype, 'getImageData').mockImplementation((_x, _y, width, height) => {
      if (width === 1 && height === 1) return onePixel;
      throw fault;
    });

    expect(explainBitmapReadback(host, source, 8192, 8192)).toEqual({ readable: true, reason: 'ok' });
    expect(() => createBitmapFromImageSource(host, source, 8192, 8192)).toThrow(fault);
  });
});
