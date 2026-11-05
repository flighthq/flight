import { BlendMode } from '@flighthq/types/contract';

import type { HasBlendMode } from './contract.node-types.ts';
import { initBlendModeTrait } from './hasBlendMode.ts';
import { createNode } from './node.ts';

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
