import { setRectangle } from '@flighthq/geometry/contract';
import { getNodeLocalBoundsRectangle } from '@flighthq/node/contract';
import { createScale9Sprite, createSprite, createScene2D } from '@flighthq/scene2d/contract';
import { createMorphShape, createShape } from '@flighthq/shape/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { findGraphHitTarget } from './hitTests';
import { setNodeHitTestEnabled } from './nodeInteractionState';
import { registerDefaultHitTests } from './registerDefaultHitTests';

describe('registerDefaultHitTests', () => {
  it('registers all built-in kinds so findGraphHitTarget resolves them', () => {
    registerDefaultHitTests();

    const bitmap = createSprite();
    setRectangle(getNodeLocalBoundsRectangle(bitmap), 0, 0, 100, 100);
    setNodeHitTestEnabled(bitmap, true);
    expect(findGraphHitTarget(bitmap, 50, 50)).toBe(bitmap);

    const scale9Sprite = createScale9Sprite({ height: 80, width: 80, x: 10, y: 10 });
    setRectangle(getNodeLocalBoundsRectangle(scale9Sprite), 0, 0, 100, 100);
    setNodeHitTestEnabled(scale9Sprite, true);
    expect(findGraphHitTarget(scale9Sprite, 50, 50)).toBe(scale9Sprite);

    const shape = createShape();
    setRectangle(getNodeLocalBoundsRectangle(shape), 0, 0, 100, 100);
    setNodeHitTestEnabled(shape, true);
    expect(findGraphHitTarget(shape, 50, 50)).toBe(shape);

    const morphShape = createMorphShape({
      [EntityRuntimeKey]: undefined,
      commands: [],
      endData: [],
      startData: [],
      winding: 'nonZero',
    });
    setRectangle(getNodeLocalBoundsRectangle(morphShape), 0, 0, 100, 100);
    setNodeHitTestEnabled(morphShape, true);
    expect(findGraphHitTarget(morphShape, 50, 50)).toBe(morphShape);
  });

  it('containers return null for self hit', () => {
    registerDefaultHitTests();

    const root = createScene2D().root;
    setRectangle(getNodeLocalBoundsRectangle(root), 0, 0, 100, 100);
    expect(findGraphHitTarget(root, 50, 50)).toBeNull();
  });
});
