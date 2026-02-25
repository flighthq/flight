import type { Bitmap } from '@flighthq/types';

import { createBitmap } from './createBitmap';

describe('createBitmap', () => {
  let bitmap: Bitmap;

  beforeEach(() => {
    bitmap = createBitmap();
  });

  it('initializes default values', () => {
    expect(bitmap.data.image).toBeNull();
    expect(bitmap.data.smoothing).toBe(true);
  });

  it('allows pre-defined values', () => {
    const image = {} as HTMLImageElement;
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
