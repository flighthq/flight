import { explainShapeTessellation } from './explainShapeTessellation';
import { createShape } from './shape';
import {
  appendShapeBeginFill,
  appendShapeBeginGradientFill,
  appendShapeEndFill,
  appendShapeLineStyle,
  appendShapeLineTo,
  appendShapeMoveTo,
  appendShapeRectangle,
} from './shapeCommands';

describe('explainShapeTessellation', () => {
  it('reports a solid fill as tessellating at any alpha, opaque or not', () => {
    // Alpha is carried on the region, so it never moves a shape off the mesh lane — worth pinning,
    // because a translucent shape that fails to draw invites blaming the alpha.
    for (const alpha of [1, 0.25, 0]) {
      const shape = createShape();
      appendShapeBeginFill(shape, 0xff0000ff, alpha);
      appendShapeRectangle(shape, 0, 0, 50, 50);
      appendShapeEndFill(shape);

      expect(explainShapeTessellation(shape.data.commands)).toEqual({ blockedBy: 'none', status: 'tessellates' });
    }
  });

  it('reports an open stroke as tessellating', () => {
    const shape = createShape();
    appendShapeLineStyle(shape, 2, 0x000000ff);
    appendShapeMoveTo(shape, 0, 0);
    appendShapeLineTo(shape, 50, 0);

    expect(explainShapeTessellation(shape.data.commands)).toEqual({ blockedBy: 'none', status: 'tessellates' });
  });

  it('names the closed stroke that the default lane declines, and clears it for the opt-in lane', () => {
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000ff, 1);
    appendShapeLineStyle(shape, 2, 0x000000ff);
    appendShapeRectangle(shape, 0, 0, 50, 50);
    appendShapeEndFill(shape);

    expect(explainShapeTessellation(shape.data.commands)).toEqual({
      blockedBy: 'stroke-outline',
      status: 'needs-rasterizer',
    });
    expect(explainShapeTessellation(shape.data.commands, true)).toEqual({
      blockedBy: 'none',
      status: 'tessellates',
    });
  });

  it('names a non-solid fill, which no stroke lane setting can rescue', () => {
    const shape = createShape();
    appendShapeBeginGradientFill(shape, 'linear', [0xff0000ff, 0x0000ffff], [1, 1], [0, 255]);
    appendShapeRectangle(shape, 0, 0, 50, 50);
    appendShapeEndFill(shape);

    expect(explainShapeTessellation(shape.data.commands)).toEqual({
      blockedBy: 'non-solid-fill',
      status: 'needs-rasterizer',
    });
    expect(explainShapeTessellation(shape.data.commands, true).status).toBe('needs-rasterizer');
  });
});
