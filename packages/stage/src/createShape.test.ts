import type { Shape } from '@flighthq/types';

import { createShape } from './createShape';

describe('createShape', () => {
  let shape: Shape;

  beforeEach(() => {
    shape = createShape();
  });

  it('initializes default values', () => {
    expect(shape.data.graphics).not.toBeNull();
    expect(shape.type).toBe('shape');
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
