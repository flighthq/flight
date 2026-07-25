import { setRectangle } from '@flighthq/geometry';
import { getNodeLocalBoundsRectangle } from '@flighthq/node';
import { createBitmap } from '@flighthq/scene2d';

import { findGraphHitTargetPrecise } from './hitTests';
import { setNodeHitTestEnabled } from './nodeInteractionState';
import { registerBitmapHitTest } from './registerBitmapHitTest';

describe('registerBitmapHitTest', () => {
  // Positive alpha-accuracy is exercised by the functional suite (jsdom cannot rasterize pixels); this
  // covers the wiring and the documented bounds fallback when no readable image is present.
  it('installs a precise Bitmap provider with a no-image bounds fallback', () => {
    registerBitmapHitTest();
    const bitmap = createBitmap();
    setRectangle(getNodeLocalBoundsRectangle(bitmap), 0, 0, 100, 100);
    setNodeHitTestEnabled(bitmap, true);

    // No image → the exact provider falls back to a bounds hit inside the box, miss outside.
    expect(findGraphHitTargetPrecise(bitmap, 50, 50)).toBe(bitmap);
    expect(findGraphHitTargetPrecise(bitmap, 200, 200)).toBeNull();
  });
});
