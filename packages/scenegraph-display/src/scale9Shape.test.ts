import { Scale9ShapeKind } from '@flighthq/types';

import { createScale9Shape, createScale9ShapeData } from './scale9Shape';

const grid = { x: 10, y: 10, width: 80, height: 80 };

describe('createScale9Shape', () => {
  it('returns a shape with the given scale9Grid on its data', () => {
    const shape = createScale9Shape(grid);
    expect(shape.data.scale9Grid).toBe(grid);
  });

  it('initializes with an empty commands array', () => {
    const shape = createScale9Shape(grid);
    expect(shape.data.commands).toHaveLength(0);
  });

  it('has Scale9ShapeKind', () => {
    const shape = createScale9Shape(grid);
    expect(shape.kind).toStrictEqual(Scale9ShapeKind);
  });

  it('returns a new object each call', () => {
    expect(createScale9Shape(grid)).not.toBe(createScale9Shape(grid));
  });
});

describe('createScale9ShapeData', () => {
  it('stores the scale9Grid reference', () => {
    const data = createScale9ShapeData(grid);
    expect(data.scale9Grid).toBe(grid);
  });

  it('returns an empty commands array', () => {
    const data = createScale9ShapeData(grid);
    expect(data.commands).toHaveLength(0);
  });

  it('uses provided commands when given', () => {
    const commands = [{ key: 'endFill' as const, args: [] as const }];
    const data = createScale9ShapeData(grid, { commands });
    expect(data.commands).toBe(commands);
  });
});
