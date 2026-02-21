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
});
