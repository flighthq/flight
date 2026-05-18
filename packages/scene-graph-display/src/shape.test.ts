import type { Shape } from '@flighthq/types';
import { ShapeKind } from '@flighthq/types';

import { createShape } from './shape';

describe('createShape', () => {
  let shape: Shape;

  beforeEach(() => {
    shape = createShape();
  });

  it('initializes default values', () => {
    expect(shape.data.graphics).not.toBeNull();
    expect(shape.kind).toStrictEqual(ShapeKind);
  });

  it('allows pre-defined values', () => {
    const base = {
      data: {
        graphics: {},
      },
    };
    const obj = createShape(base);
    expect(obj.data.graphics).toStrictEqual(base.data.graphics);
  });

  it('returns a new object for better hidden-class performance', () => {
    const base = {};
    const obj = createShape(base);
    expect(obj).not.toStrictEqual(base);
  });
});
