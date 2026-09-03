import { setRectangle } from '@flighthq/geometry/contract';
import { getNodeLocalBoundsRectangle } from '@flighthq/node/contract';
import { createSprite } from '@flighthq/scene2d/contract';
import type { HasGraphicsBitmapReadback } from '@flighthq/types/contract';

import { findGraphHitTargetPrecise } from './hitTests';
import { setNodeHitTestEnabled } from './nodeInteractionState';
import { registerSpriteHitTest } from './registerSpriteHitTest';

const stubHost = {
  graphics: { bitmapReadback: { readBitmap: () => ({ bitmap: null, reason: 'ok' }) } },
} as HasGraphicsBitmapReadback;

describe('registerSpriteHitTest', () => {
  it('installs a precise Sprite provider with a no-image bounds fallback', () => {
    registerSpriteHitTest(stubHost);
    const bitmap = createSprite();
    setRectangle(getNodeLocalBoundsRectangle(bitmap), 0, 0, 100, 100);
    setNodeHitTestEnabled(bitmap, true);

    // No image → the exact provider falls back to a bounds hit inside the box, miss outside.
    expect(findGraphHitTargetPrecise(bitmap, 50, 50)).toBe(bitmap);
    expect(findGraphHitTargetPrecise(bitmap, 200, 200)).toBeNull();
  });
});
