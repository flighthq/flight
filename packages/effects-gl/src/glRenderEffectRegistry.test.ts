import { createGlContextFromCanvasElement, createGlRenderState } from '@flighthq/render-gl/contract';
import { getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import type { GlRenderState, RenderEffect } from '@flighthq/types/contract';

import {
  getGlRenderEffectRunner,
  hasGlRenderEffectRunner,
  isGlRenderEffectResolvable,
  registerGlRenderEffect,
} from './glRenderEffectRegistry';

describe('getGlRenderEffectRunner', () => {
  it('is a function', () => {
    expect(typeof getGlRenderEffectRunner).toBe('function');
  });

  it('returns null for an unregistered kind', () => {
    const state = createState();
    expect(getGlRenderEffectRunner(state, 'UnknownEffect')).toBeNull();
  });
});

describe('hasGlRenderEffectRunner', () => {
  it('is a function', () => {
    expect(typeof hasGlRenderEffectRunner).toBe('function');
  });

  it('returns false for an unregistered kind', () => {
    const state = createState();
    expect(hasGlRenderEffectRunner(state, 'NotRegisteredEffect')).toBe(false);
  });

  it('returns true after a runner is registered', () => {
    const state = createState();
    const runner = vi.fn();
    registerGlRenderEffect(state, 'HasTestEffect', runner);
    expect(hasGlRenderEffectRunner(state, 'HasTestEffect')).toBe(true);
  });
});

describe('isGlRenderEffectResolvable', () => {
  it('treats a kind registered without a resolver as always resolvable', () => {
    const state = createState();
    registerGlRenderEffect(state, 'ResolvableTestEffect', vi.fn());
    expect(isGlRenderEffectResolvable(state, effect('ResolvableTestEffect'))).toBe(true);
  });

  it('asks the registered resolver, per effect instance', () => {
    const state = createState();
    registerGlRenderEffect(state, 'ResolverTestEffect', vi.fn(), (_state, candidate) => 'key' in candidate);
    expect(isGlRenderEffectResolvable(state, effect('ResolverTestEffect'))).toBe(false);
    expect(isGlRenderEffectResolvable(state, effect('ResolverTestEffect', { key: 'k' }))).toBe(true);
  });

  it('reports an unregistered kind as unresolvable, since there is nothing to resolve it with', () => {
    const state = createState();
    expect(isGlRenderEffectResolvable(state, effect('NeverRegisteredEffect'))).toBe(false);
  });
});

describe('registerGlRenderEffect', () => {
  it('is a function', () => {
    expect(typeof registerGlRenderEffect).toBe('function');
  });

  it('registers and retrieves a runner', () => {
    const state = createState();
    const runner = vi.fn();
    const before = getGlRenderStateRuntime(state).registries.renderEffects;
    registerGlRenderEffect(state, 'TestEffect', runner);
    expect(getGlRenderEffectRunner(state, 'TestEffect')).toBe(runner);
    expect(getGlRenderStateRuntime(state).registries.renderEffects).not.toBe(before);
    expect(before.entries.size).toBe(0);
  });

  it('overwrites an existing runner under the same kind', () => {
    const state = createState();
    const runnerA = vi.fn();
    const runnerB = vi.fn();
    registerGlRenderEffect(state, 'TestEffect2', runnerA);
    const before = getGlRenderStateRuntime(state).registries.renderEffects;
    registerGlRenderEffect(state, 'TestEffect2', runnerB);
    expect(getGlRenderEffectRunner(state, 'TestEffect2')).toBe(runnerB);
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
  return createGlRenderState(createGlContextFromCanvasElement(canvas));
}

function effect(kind: string, extra: Readonly<Record<string, unknown>> = {}): Readonly<RenderEffect> {
  return { kind, ...extra } as unknown as Readonly<RenderEffect>;
}
