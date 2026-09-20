import { createWebGlContext } from '@flighthq/host-web/contract';
import { allocateEmptyGlRenderRegistries, createGlRenderState } from '@flighthq/render-gl/contract';
import { getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import type { GlRenderState, Effect } from '@flighthq/types/contract';

import { getGlEffectRunner, hasGlEffectRunner, isGlEffectResolvable, registerGlEffect } from './glEffectRegistry';

describe('getGlEffectRunner', () => {
  it('is a function', () => {
    expect(typeof getGlEffectRunner).toBe('function');
  });

  it('returns null for an unregistered kind', () => {
    const state = createState();
    expect(getGlEffectRunner(state, 'UnknownEffect')).toBeNull();
  });
});

describe('hasGlEffectRunner', () => {
  it('is a function', () => {
    expect(typeof hasGlEffectRunner).toBe('function');
  });

  it('returns false for an unregistered kind', () => {
    const state = createState();
    expect(hasGlEffectRunner(state, 'NotRegisteredEffect')).toBe(false);
  });

  it('returns true after a runner is registered', () => {
    const state = createState();
    const runner = vi.fn();
    registerGlEffect(state, 'HasTestEffect', runner);
    expect(hasGlEffectRunner(state, 'HasTestEffect')).toBe(true);
  });
});

describe('isGlEffectResolvable', () => {
  it('treats a kind registered without a resolver as always resolvable', () => {
    const state = createState();
    registerGlEffect(state, 'ResolvableTestEffect', vi.fn());
    expect(isGlEffectResolvable(state, effect('ResolvableTestEffect'))).toBe(true);
  });

  it('asks the registered resolver, per effect instance', () => {
    const state = createState();
    registerGlEffect(state, 'ResolverTestEffect', vi.fn(), (_state, candidate) => 'key' in candidate);
    expect(isGlEffectResolvable(state, effect('ResolverTestEffect'))).toBe(false);
    expect(isGlEffectResolvable(state, effect('ResolverTestEffect', { key: 'k' }))).toBe(true);
  });

  it('reports an unregistered kind as unresolvable, since there is nothing to resolve it with', () => {
    const state = createState();
    expect(isGlEffectResolvable(state, effect('NeverRegisteredEffect'))).toBe(false);
  });
});

describe('registerGlEffect', () => {
  it('is a function', () => {
    expect(typeof registerGlEffect).toBe('function');
  });

  it('registers and retrieves a runner', () => {
    const state = createState();
    const runner = vi.fn();
    const before = getGlRenderStateRuntime(state).registries.effects;
    registerGlEffect(state, 'TestEffect', runner);
    expect(getGlEffectRunner(state, 'TestEffect')).toBe(runner);
    expect(getGlRenderStateRuntime(state).registries.effects).not.toBe(before);
    expect(before.entries.size).toBe(0);
  });

  it('overwrites an existing runner under the same kind', () => {
    const state = createState();
    const runnerA = vi.fn();
    const runnerB = vi.fn();
    registerGlEffect(state, 'TestEffect2', runnerA);
    const before = getGlRenderStateRuntime(state).registries.effects;
    registerGlEffect(state, 'TestEffect2', runnerB);
    expect(getGlEffectRunner(state, 'TestEffect2')).toBe(runnerB);
    expect(before.entries.get('TestEffect2')).toEqual({
      state: 'bound',
      value: { isResolvable: undefined, runner: runnerA },
    });
  });
});

function createState(): GlRenderState {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  return createGlRenderState(createWebGlContext(canvas), allocateEmptyGlRenderRegistries());
}

function effect(kind: string, extra: Readonly<Record<string, unknown>> = {}): Readonly<Effect> {
  return { kind, ...extra } as unknown as Readonly<Effect>;
}
