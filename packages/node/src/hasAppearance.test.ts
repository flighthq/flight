import type { HasAppearance, HasAppearanceRuntime, NodeRuntime } from '@flighthq/types/contract';

import { initAppearanceRuntimeTrait, initAppearanceTrait } from './hasAppearance';
import { createNode, createNodeRuntime } from './node';

const TestKind = 'Test';

function makeTarget(): HasAppearance {
  const node = createNode(TestKind) as unknown as HasAppearance;
  return node;
}

describe('initAppearanceRuntimeTrait', () => {
  let runtime: NodeRuntime<HasAppearance> & HasAppearanceRuntime;

  beforeEach(() => {
    runtime = createNodeRuntime() as NodeRuntime<HasAppearance> & HasAppearanceRuntime;
  });

  it('initializes default values', () => {
    initAppearanceRuntimeTrait(runtime);

    expect(runtime.worldAlpha).toBeNull();
    expect(runtime.worldAlphaUsingAppearanceId).toStrictEqual(-1);
    expect(runtime.worldAlphaUsingParentAppearanceId).toStrictEqual(-1);
    expect(runtime.worldAppearanceId).toStrictEqual(0);
  });

  it('resets a resolved cache back to the unresolved state', () => {
    runtime.worldAlpha = 0.25;
    runtime.worldAlphaUsingAppearanceId = 7;
    runtime.worldAlphaUsingParentAppearanceId = 9;
    runtime.worldAppearanceId = 11;
    initAppearanceRuntimeTrait(runtime);

    expect(runtime.worldAlpha).toBeNull();
    expect(runtime.worldAlphaUsingAppearanceId).toStrictEqual(-1);
    expect(runtime.worldAlphaUsingParentAppearanceId).toStrictEqual(-1);
    expect(runtime.worldAppearanceId).toStrictEqual(0);
  });
});

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
