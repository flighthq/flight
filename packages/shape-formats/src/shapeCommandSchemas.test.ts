import { getRegistryTableEntry } from '@flighthq/registry/contract';

import { defaultShapeCommandSchemas } from './shapeCommandSchemas';

describe('defaultShapeCommandSchemas', () => {
  it('pins the authored quadratic curve argument names to the ShapeCommandRegistry labels', () => {
    const schema = getRegistryTableEntry(defaultShapeCommandSchemas, 'curveTo');
    expect(schema?.arguments.map(({ name }) => name)).toEqual(['controlX', 'controlY', 'anchorX', 'anchorY']);
  });

  it('pins the authored cubic curve argument names to the ShapeCommandRegistry labels', () => {
    const schema = getRegistryTableEntry(defaultShapeCommandSchemas, 'cubicCurveTo');
    expect(schema?.arguments.map(({ name }) => name)).toEqual([
      'controlX1',
      'controlY1',
      'controlX2',
      'controlY2',
      'anchorX',
      'anchorY',
    ]);
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
