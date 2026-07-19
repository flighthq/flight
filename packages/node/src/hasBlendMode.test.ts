import type { HasBlendMode } from '@flighthq/types';
import { BlendMode } from '@flighthq/types';

import { initBlendModeTrait } from './hasBlendMode';
import { createNode } from './node';

const TestKind = 'Test';

function makeTarget(): HasBlendMode {
  return createNode(TestKind) as unknown as HasBlendMode;
}

describe('initBlendModeTrait', () => {
  it('defaults blendMode to null', () => {
    const target = makeTarget();
    initBlendModeTrait(target);
    expect(target.blendMode).toBeNull();
  });

  it('applies a blendMode override', () => {
    const target = makeTarget();
    initBlendModeTrait(target, { blendMode: BlendMode.Add });
    expect(target.blendMode).toBe(BlendMode.Add);
  });
});
