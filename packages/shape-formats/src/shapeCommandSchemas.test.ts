import { getRegistryTableEntry } from '@flighthq/registry/contract';

import { defaultShapeCommandSchemas } from './shapeCommandSchemas';

describe('defaultShapeCommandSchemas', () => {
  it('pins the authored quadratic curve argument names to the ShapeCommandRegistry labels', () => {
    const schema = getRegistryTableEntry(defaultShapeCommandSchemas, 'quadraticCurveTo');
    expect(schema?.arguments.map(({ name }) => name)).toEqual(['controlX', 'controlY', 'x', 'y']);
  });

  it('pins the authored cubic curve argument names to the ShapeCommandRegistry labels', () => {
    const schema = getRegistryTableEntry(defaultShapeCommandSchemas, 'cubicCurveTo');
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
    expect(getRegistryTableEntry(defaultShapeCommandSchemas, 'drawCircle')?.arguments.map(({ name }) => name)).toEqual([
      'centerX',
      'centerY',
      'radius',
    ]);
    expect(getRegistryTableEntry(defaultShapeCommandSchemas, 'drawEllipse')?.arguments.map(({ name }) => name)).toEqual(
      ['centerX', 'centerY', 'radiusX', 'radiusY'],
    );
  });

  it('names the rounded-rectangle radius without Flash ellipse-width vocabulary', () => {
    expect(
      getRegistryTableEntry(defaultShapeCommandSchemas, 'drawRoundedRectangle')?.arguments.map(({ name }) => name),
    ).toEqual(['x', 'y', 'width', 'height', 'radius']);
  });

  it('carries positional validation types and required arity in the same runtime entry', () => {
    expect(getRegistryTableEntry(defaultShapeCommandSchemas, 'drawTriangles')).toEqual({
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
