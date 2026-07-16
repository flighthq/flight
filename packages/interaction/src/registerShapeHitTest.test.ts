import { setRectangle } from '@flighthq/geometry';
import { getNodeLocalBoundsRectangle } from '@flighthq/node';
import { appendShapeBeginFill, appendShapeCircle, appendShapeEndFill, createShape } from '@flighthq/shape';
import { ShapeKind } from '@flighthq/types';

import { findGraphHitTargetPrecise, hitTestGraphLocalBounds, hitTestGraphPoint, registerHitTest } from './hitTests';
import { setNodeHitTestEnabled } from './nodeInteractionState';
import { registerShapeHitTest } from './registerShapeHitTest';

describe('registerShapeHitTest', () => {
  it('winding-tests the actual fill for precise queries, so a bbox corner outside the circle misses', () => {
    registerHitTest(ShapeKind, hitTestGraphLocalBounds);
    registerShapeHitTest();
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000ff, 1);
    appendShapeCircle(shape, 50, 50, 40);
    appendShapeEndFill(shape);
    setRectangle(getNodeLocalBoundsRectangle(shape), 10, 10, 80, 80);
    setNodeHitTestEnabled(shape, true);

    // Center is inside the fill; (85,85) is inside the bounding box but outside the circle.
    expect(findGraphHitTargetPrecise(shape, 50, 50)).toBe(shape);
    expect(findGraphHitTargetPrecise(shape, 85, 85)).toBeNull();
    // The coarse query still counts (85,85) as a hit.
    expect(hitTestGraphPoint(shape, 85, 85)).toBe(true);
  });
});
