import { createBitmap, createStage } from '@flighthq/displayobject';
import { setRectangle } from '@flighthq/geometry';
import { getNodeLocalBoundsRectangle } from '@flighthq/node';
import { createShape } from '@flighthq/shape';

import { findGraphHitTarget } from './hitTests';
import { registerDefaultHitTestPoints } from './registerDefaultHitTestPoints';

describe('registerDefaultHitTestPoints', () => {
  it('registers all built-in kinds so findGraphHitTarget resolves them', () => {
    registerDefaultHitTestPoints();

    const bitmap = createBitmap();
    setRectangle(getNodeLocalBoundsRectangle(bitmap), 0, 0, 100, 100);
    expect(findGraphHitTarget(bitmap, 50, 50)).toBe(bitmap);

    const shape = createShape();
    setRectangle(getNodeLocalBoundsRectangle(shape), 0, 0, 100, 100);
    expect(findGraphHitTarget(shape, 50, 50)).toBe(shape);
  });

  it('containers return null for self hit', () => {
    registerDefaultHitTestPoints();

    const stage = createStage();
    setRectangle(getNodeLocalBoundsRectangle(stage), 0, 0, 100, 100);
    expect(findGraphHitTarget(stage, 50, 50)).toBeNull();
  });
});
