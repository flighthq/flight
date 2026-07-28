import { setRectangle } from '@flighthq/geometry/contract';
import { getNodeLocalBoundsRectangle } from '@flighthq/node/contract';
import { createSprite } from '@flighthq/scene2d/contract';

import { findGraphHitTargetPrecise } from './hitTests';
import { setNodeHitTestEnabled } from './nodeInteractionState';
import { registerSpriteHitTest } from './registerSpriteHitTest';

describe('registerSpriteHitTest', () => {
  // Positive alpha-accuracy is exercised by the functional suite (jsdom cannot rasterize pixels); this
  // covers the wiring and the documented bounds fallback when no readable image is present.
  it('installs a precise Sprite provider with a no-image bounds fallback', () => {
    registerSpriteHitTest();
    const bitmap = createSprite();
    setRectangle(getNodeLocalBoundsRectangle(bitmap), 0, 0, 100, 100);
    setNodeHitTestEnabled(bitmap, true);

    // No image → the exact provider falls back to a bounds hit inside the box, miss outside.
    expect(findGraphHitTargetPrecise(bitmap, 50, 50)).toBe(bitmap);
    expect(findGraphHitTargetPrecise(bitmap, 200, 200)).toBeNull();
  });
});
