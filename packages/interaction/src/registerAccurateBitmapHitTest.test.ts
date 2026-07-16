import { createBitmap } from '@flighthq/displayobject';
import { setRectangle } from '@flighthq/geometry';
import { getNodeLocalBoundsRectangle } from '@flighthq/node';

import { hitTestGraphPoint } from './hitTests';
import { setNodeHitTestEnabled } from './nodeInteractionState';
import { registerAccurateBitmapHitTest } from './registerAccurateBitmapHitTest';

describe('registerAccurateBitmapHitTest', () => {
  // Positive alpha-accuracy is exercised by the functional suite (jsdom cannot rasterize pixels); these
  // cover the wiring and the documented bounds fallback when no readable image is present.
  it('installs a Bitmap handler that respects bounds and the no-image fallback', () => {
    registerAccurateBitmapHitTest();
    const bitmap = createBitmap();
    setRectangle(getNodeLocalBoundsRectangle(bitmap), 0, 0, 100, 100);
    setNodeHitTestEnabled(bitmap, true);

    // No image → falls back to the bounds box under shapeFlag, and the coarse tier is bounds too.
    expect(hitTestGraphPoint(bitmap, 50, 50, true)).toBe(true);
    expect(hitTestGraphPoint(bitmap, 50, 50, false)).toBe(true);
    // Outside the bounds box misses regardless of tier.
    expect(hitTestGraphPoint(bitmap, 200, 200, true)).toBe(false);
  });
});
