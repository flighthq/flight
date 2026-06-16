import type { HasAppearance } from '@flighthq/types';
import { BlendMode } from '@flighthq/types';

import { initAppearanceTrait } from './hasAppearance';
import { createNode } from './node';

const TestKind: unique symbol = Symbol('Test');

function makeTarget(): HasAppearance {
  const node = createNode(TestKind, TestKind) as unknown as HasAppearance;
  return node;
}

describe('initAppearanceTrait', () => {
  it('sets default values when called with no options', () => {
    const target = makeTarget();
    initAppearanceTrait(target);

    expect(target.alpha).toBe(1);
    expect(target.blendMode).toBeNull();
    expect(target.visible).toBe(true);
  });

  it('applies partial overrides', () => {
    const target = makeTarget();
    initAppearanceTrait(target, { alpha: 0.5, visible: false });

    expect(target.alpha).toBe(0.5);
    expect(target.visible).toBe(false);
    expect(target.blendMode).toBeNull();
  });

  it('applies blendMode override', () => {
    const target = makeTarget();
    initAppearanceTrait(target, { blendMode: BlendMode.Add });

    expect(target.blendMode).toBe(BlendMode.Add);
  });

  it('overwrites existing values', () => {
    const target = makeTarget();
    initAppearanceTrait(target);
    initAppearanceTrait(target, { alpha: 0.25 });

    expect(target.alpha).toBe(0.25);
  });
});
