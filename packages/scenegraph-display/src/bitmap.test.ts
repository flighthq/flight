import type { Bitmap, ImageSource, Rectangle } from '@flighthq/types';
import { BitmapKind } from '@flighthq/types';

import {
  computeBitmapLocalBoundsRect,
  createBitmap,
  createBitmapData,
  createBitmapRuntime,
  getBitmapRuntime,
} from './bitmap';

describe('createBitmap', () => {
  let bitmap: Bitmap;

  beforeEach(() => {
    bitmap = createBitmap();
  });

  it('initializes default values', () => {
    expect(bitmap.data.image).toBeNull();
    expect(bitmap.data.smoothing).toBe(true);
    expect(bitmap.kind).toBe(BitmapKind);
  });

  it('allows pre-defined values', () => {
    const image = {} as ImageSource;
    const base = {
      data: {
        image: image,
        smoothing: false,
      },
    };
    const obj = createBitmap(base);
    expect(obj.data.image).toBe(image);
    expect(obj.data.smoothing).toBe(false);
  });

  it('returns a new object for better hidden-class performance', () => {
    const base = {};
    const obj = createBitmap(base);
    expect(obj).not.toStrictEqual(base);
  });
});

describe('computeBitmapLocalBoundsRect', () => {
  it('sets out dimensions from image when image is present', () => {
    const bitmap = createBitmap({ data: { image: { width: 100, height: 200 } as ImageSource } });
    const out: Rectangle = { x: 0, y: 0, width: 0, height: 0 };
    computeBitmapLocalBoundsRect(out, bitmap);
    expect(out.width).toBe(100);
    expect(out.height).toBe(200);
  });

  it('does not modify out when image is null', () => {
    const bitmap = createBitmap();
    const out: Rectangle = { x: 0, y: 0, width: 50, height: 60 };
    computeBitmapLocalBoundsRect(out, bitmap);
    expect(out.width).toBe(50);
    expect(out.height).toBe(60);
  });
});

describe('createBitmapData', () => {
  it('returns default values', () => {
    const data = createBitmapData();
    expect(data.image).toBeNull();
    expect(data.smoothing).toBe(true);
  });

  it('allows pre-defined values', () => {
    const image = { width: 10, height: 10 } as ImageSource;
    const data = createBitmapData({ image, smoothing: false });
    expect(data.image).toBe(image);
    expect(data.smoothing).toBe(false);
  });
});

describe('createBitmapRuntime', () => {
  it('returns a non-null runtime', () => {
    const runtime = createBitmapRuntime();
    expect(runtime).not.toBeNull();
  });

  it('uses computeBitmapLocalBoundsRect', () => {
    const runtime = createBitmapRuntime();
    expect(runtime.computeLocalBoundsRect).toStrictEqual(computeBitmapLocalBoundsRect);
  });
});

describe('getBitmapRuntime', () => {
  it('returns the runtime of the given Bitmap', () => {
    const bitmap = createBitmap();
    const runtime = getBitmapRuntime(bitmap);
    expect(runtime).not.toBeNull();
  });
});
