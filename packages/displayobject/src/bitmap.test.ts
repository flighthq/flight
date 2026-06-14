import { getEntityRuntime } from '@flighthq/entity';
import { createRectangle } from '@flighthq/geometry';
import type { Bitmap, BitmapRuntime, ImageSource, Node } from '@flighthq/types';
import { BitmapKind } from '@flighthq/types';

import {
  computeBitmapLocalBoundsRectangle,
  createBitmap,
  createBitmapData,
  createBitmapRuntime,
  getBitmapRuntime,
  setBitmapImage,
} from './bitmap';

describe('computeBitmapLocalBoundsRectangle', () => {
  it('sets out dimensions from image when image is present', () => {
    const bitmap = createBitmap({ data: { image: { width: 100, height: 200 } as ImageSource } });
    const out = createRectangle();
    computeBitmapLocalBoundsRectangle(out, bitmap as unknown as Node);
    expect(out.width).toBe(100);
    expect(out.height).toBe(200);
  });

  it('does not modify out when image is null', () => {
    const bitmap = createBitmap();
    const out = createRectangle(0, 0, 50, 60);
    computeBitmapLocalBoundsRectangle(out, bitmap as unknown as Node);
    expect(out.width).toBe(50);
    expect(out.height).toBe(60);
  });
});

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

  it('uses computeBitmapLocalBoundsRectangle', () => {
    const runtime = createBitmapRuntime();
    expect(runtime.computeLocalBoundsRectangle).toStrictEqual(computeBitmapLocalBoundsRectangle);
  });
});

describe('getBitmapRuntime', () => {
  it('returns the runtime of the given Bitmap', () => {
    const bitmap = createBitmap();
    const runtime = getBitmapRuntime(bitmap);
    expect(runtime).not.toBeNull();
  });
});

describe('setBitmapImage', () => {
  it('sets the image', () => {
    const bitmap = createBitmap();
    const image = { width: 64, height: 64 } as ImageSource;
    setBitmapImage(bitmap, image);
    expect(bitmap.data.image).toBe(image);
  });

  it('accepts null', () => {
    const bitmap = createBitmap({ data: { image: { width: 1, height: 1 } as ImageSource } });
    setBitmapImage(bitmap, null);
    expect(bitmap.data.image).toBeNull();
  });

  it('invalidates local bounds', () => {
    const bitmap = createBitmap();
    const runtime = getEntityRuntime(bitmap) as BitmapRuntime;
    const idBefore = runtime.localBoundsID;
    setBitmapImage(bitmap, { width: 64, height: 64 } as ImageSource);
    expect(runtime.localBoundsID).not.toBe(idBefore);
  });

  it('invalidates appearance', () => {
    const bitmap = createBitmap();
    const runtime = getEntityRuntime(bitmap) as BitmapRuntime;
    const idBefore = runtime.appearanceID;
    setBitmapImage(bitmap, { width: 64, height: 64 } as ImageSource);
    expect(runtime.appearanceID).not.toBe(idBefore);
  });
});
