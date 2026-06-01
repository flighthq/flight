import type { HasAppearance } from '@flighthq/types';
import { BlendMode } from '@flighthq/types';

import { createGraphNode } from './graphNode';
import { initAppearanceTrait } from './hasAppearance';

const TestKind: unique symbol = Symbol('Test');

function makeTarget(): HasAppearance {
  const node = createGraphNode(TestKind, TestKind) as unknown as HasAppearance;
  return node;
}

describe('initAppearanceTrait', () => {
  it('sets default values when called with no options', () => {
    const target = makeTarget();
    initAppearanceTrait(target);

    expect(target.alpha).toBe(1);
    expect(target.blendMode).toBeNull();
    expect(target.colorTransform).toBeNull();
    expect(target.shader).toBeNull();
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

  it('applies colorTransform override', () => {
    const ct = {} as any;
    const target = makeTarget();
    initAppearanceTrait(target, { colorTransform: ct });

    expect(target.colorTransform).toBe(ct);
  });

  it('applies shader override', () => {
    const shader = {} as any;
    const target = makeTarget();
    initAppearanceTrait(target, { shader });

    expect(target.shader).toBe(shader);
  });

  it('overwrites existing values', () => {
    const target = makeTarget();
    initAppearanceTrait(target);
    initAppearanceTrait(target, { alpha: 0.25 });

    expect(target.alpha).toBe(0.25);
  });
});
