import type { HasColorTransform } from '@flighthq/types';

import { initColorTransformTrait } from './hasColorTransform';
import { createNode } from './node';

const TestKind = 'Test';

function makeTarget(): HasColorTransform {
  return createNode(TestKind) as unknown as HasColorTransform;
}

describe('initColorTransformTrait', () => {
  it('defaults colorTransform to null', () => {
    const target = makeTarget();
    initColorTransformTrait(target);

    expect(target.colorTransform).toBeNull();
  });

  it('applies a colorTransform override', () => {
    const colorTransform = { redMultiplier: 0.5 } as any;
    const target = makeTarget();
    initColorTransformTrait(target, { colorTransform });

    expect(target.colorTransform).toBe(colorTransform);
  });
});
