import { ShapeKind } from '@flighthq/types';

import { createShape } from './shape';

describe('createShape', () => {
  it('initializes with an empty graphics command buffer', () => {
    const shape = createShape();
    expect(shape.data.graphics.commands).toHaveLength(0);
    expect(shape.kind).toStrictEqual(ShapeKind);
  });

  it('allows a pre-defined graphics object', () => {
    const graphics = { commands: [] };
    const shape = createShape({ data: { graphics } });
    expect(shape.data.graphics).toBe(graphics);
  });

  it('returns a new object for better hidden-class performance', () => {
    expect(createShape()).not.toBe(createShape());
  });
});
