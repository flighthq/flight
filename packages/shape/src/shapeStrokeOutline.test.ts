import type { ShapeCommandToken } from '@flighthq/types/contract';

import { createShape } from './shape';
import { appendShapeLineStyle, appendShapeLineTo, appendShapeMoveTo, appendShapeRectangle } from './shapeCommands';
import { getShapeStrokeOutlineRegions } from './shapeStrokeOutline';

describe('getShapeStrokeOutlineRegions', () => {
  it('converts a solid open stroke into a fill region with matching color and alpha', () => {
    const shape = createShape();
    appendShapeLineStyle(shape, 8, 0x123456ff, 0.5, false, 'normal', 'square', 'bevel', 4);
    appendShapeMoveTo(shape, 0, 0);
    appendShapeLineTo(shape, 20, 0);

    const regions = getShapeStrokeOutlineRegions(shape.data.commands);

    expect(regions).not.toBeNull();
    expect(regions).toHaveLength(1);
    expect(regions![0]).toMatchObject({ alpha: 0.5, color: 0x123456ff });
    expect(regions![0].path.commands.length).toBeGreaterThan(0);
  });

  it('defers closed and non-solid strokes to the renderer fallback', () => {
    const closed = createShape();
    appendShapeLineStyle(closed, 8);
    appendShapeRectangle(closed, 0, 0, 20, 10);
    expect(getShapeStrokeOutlineRegions(closed.data.commands)).toBeNull();

    const gradient: ShapeCommandToken[] = ['lineGradientStyle', 1, 0];
    expect(getShapeStrokeOutlineRegions(gradient)).toBeNull();
  });
});
