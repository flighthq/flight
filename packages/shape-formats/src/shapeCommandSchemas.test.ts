import { defaultShapeCommandSchemas } from './shapeCommandSchemas.ts';

describe('defaultShapeCommandSchemas', () => {
  it('pins the authored quadratic curve argument names to the ShapeCommandRegistry labels', () => {
    const schema = defaultShapeCommandSchemas.get('quadraticCurveTo') ?? null;
    expect(schema?.arguments.map(({ name }) => name)).toEqual(['controlX', 'controlY', 'x', 'y']);
  });

  it('pins the authored cubic curve argument names to the ShapeCommandRegistry labels', () => {
    const schema = defaultShapeCommandSchemas.get('cubicCurveTo') ?? null;
    expect(schema?.arguments.map(({ name }) => name)).toEqual([
      'controlX1',
      'controlY1',
      'controlX2',
      'controlY2',
      'x',
      'y',
    ]);
  });

  it('names circle and ellipse centers and uses no Flash diameter vocabulary', () => {
    expect(defaultShapeCommandSchemas.get('drawCircle')?.arguments.map(({ name }) => name)).toEqual([
      'centerX',
      'centerY',
      'radius',
    ]);
    expect(defaultShapeCommandSchemas.get('drawEllipse')?.arguments.map(({ name }) => name)).toEqual([
      'centerX',
      'centerY',
      'radiusX',
      'radiusY',
    ]);
  });

  it('names the rounded-rectangle radius without Flash ellipse-width vocabulary', () => {
    expect(defaultShapeCommandSchemas.get('drawRoundedRectangle')?.arguments.map(({ name }) => name)).toEqual([
      'x',
      'y',
      'width',
      'height',
      'radius',
    ]);
  });

  it('carries positional validation types and required arity in the same runtime entry', () => {
    expect(defaultShapeCommandSchemas.get('drawTriangles') ?? null).toEqual({
      arguments: [
        { name: 'vertices', type: 'numbers' },
        { name: 'indices', type: 'numbersOrNull' },
        { name: 'uvtData', type: 'numbersOrNull' },
        { name: 'culling', type: 'string' },
      ],
      key: 'drawTriangles',
      requiredArgumentCount: 1,
    });
  });
});
