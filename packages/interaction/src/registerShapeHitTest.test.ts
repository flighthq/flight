import { setRectangle } from '@flighthq/geometry/contract';
import { getNodeLocalBoundsRectangle } from '@flighthq/node/contract';
import { appendPathCircle, appendPathRectangle, createPath, createPathMorph } from '@flighthq/path/contract';
import {
  appendMorphShapePath,
  appendShapeBeginFill,
  appendShapeCircle,
  appendShapeEndFill,
  createMorphShape,
  createShape,
  setMorphShapeProgress,
} from '@flighthq/shape/contract';
import { MorphShapeKind, ShapeKind } from '@flighthq/types/contract';

import { findGraphHitTargetPrecise, hitTestGraphLocalBounds, hitTestGraphPoint, registerHitTest } from './hitTests';
import { setNodeHitTestEnabled } from './nodeInteractionState';
import { registerShapeHitTest } from './registerShapeHitTest';

describe('registerShapeHitTest', () => {
  it('winding-tests the MorphShape live sample for precise queries', () => {
    registerHitTest(MorphShapeKind, hitTestGraphLocalBounds);
    registerShapeHitTest();
    const start = createPath();
    appendPathCircle(start, 50, 50, 40);
    const end = createPath();
    appendPathRectangle(end, 10, 10, 80, 80);
    const shape = createMorphShape(createPathMorph(start, end)!);
    appendShapeBeginFill(shape, 0xff0000ff, 1);
    appendMorphShapePath(shape);
    appendShapeEndFill(shape);
    setRectangle(getNodeLocalBoundsRectangle(shape), 10, 10, 80, 80);
    setNodeHitTestEnabled(shape, true);

    expect(findGraphHitTargetPrecise(shape, 85, 85)).toBeNull();
    setMorphShapeProgress(shape, 1);
    expect(findGraphHitTargetPrecise(shape, 85, 85)).toBe(shape);
  });

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
