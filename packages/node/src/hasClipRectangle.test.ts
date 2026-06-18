import type { HasClipRectangle, Rectangle } from '@flighthq/types';

import { initClipRectangleTrait } from './hasClipRectangle';
import { createNode } from './node';

const TestKind: unique symbol = Symbol('Test');

function makeTarget(): HasClipRectangle {
  return createNode(TestKind) as unknown as HasClipRectangle;
}

describe('initClipRectangleTrait', () => {
  it('defaults clipRectangle to null', () => {
    const target = makeTarget();
    initClipRectangleTrait(target);

    expect(target.clipRectangle).toBeNull();
  });

  it('applies a clipRectangle override', () => {
    const clipRectangle = { height: 4, width: 3, x: 1, y: 2 } as Rectangle;
    const target = makeTarget();
    initClipRectangleTrait(target, { clipRectangle });

    expect(target.clipRectangle).toBe(clipRectangle);
  });
});
