import type { HasAppearance } from '@flighthq/types';

import { initAppearanceTrait } from './hasAppearance';
import { createNode } from './node';

const TestKind = 'Test';

function makeTarget(): HasAppearance {
  const node = createNode(TestKind) as unknown as HasAppearance;
  return node;
}

describe('initAppearanceTrait', () => {
  it('sets default values when called with no options', () => {
    const target = makeTarget();
    initAppearanceTrait(target);

    expect(target.alpha).toBe(1);
    expect(target.visible).toBe(true);
  });

  it('applies partial overrides', () => {
    const target = makeTarget();
    initAppearanceTrait(target, { alpha: 0.5, visible: false });

    expect(target.alpha).toBe(0.5);
    expect(target.visible).toBe(false);
  });

  it('overwrites existing values', () => {
    const target = makeTarget();
    initAppearanceTrait(target);
    initAppearanceTrait(target, { alpha: 0.25 });

    expect(target.alpha).toBe(0.25);
  });
});
