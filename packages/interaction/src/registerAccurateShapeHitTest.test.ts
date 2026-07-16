import { setRectangle } from '@flighthq/geometry';
import { getNodeLocalBoundsRectangle } from '@flighthq/node';
import { appendShapeBeginFill, appendShapeCircle, appendShapeEndFill, createShape } from '@flighthq/shape';

import { hitTestGraphPoint } from './hitTests';
import { setNodeHitTestEnabled } from './nodeInteractionState';
import { registerAccurateShapeHitTest } from './registerAccurateShapeHitTest';

describe('registerAccurateShapeHitTest', () => {
  it('winding-tests the actual fill under shapeFlag, so a bbox corner outside the circle misses', () => {
    registerAccurateShapeHitTest();
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000ff, 1);
    appendShapeCircle(shape, 50, 50, 40);
    appendShapeEndFill(shape);
    setRectangle(getNodeLocalBoundsRectangle(shape), 10, 10, 80, 80);
    setNodeHitTestEnabled(shape, true);

    // Center is inside the fill; (85,85) is inside the bounding box but outside the circle.
    expect(hitTestGraphPoint(shape, 50, 50, true)).toBe(true);
    expect(hitTestGraphPoint(shape, 85, 85, true)).toBe(false);
    // Without shapeFlag, the coarse bounds box still counts (85,85) as a hit.
    expect(hitTestGraphPoint(shape, 85, 85, false)).toBe(true);
  });
});
