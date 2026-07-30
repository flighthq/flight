import { createGlRenderState } from '@flighthq/render-gl/contract';
import type { GlRenderState } from '@flighthq/types/contract';

import { getGlRenderEffectRunner, hasGlRenderEffectRunner, registerGlRenderEffect } from './glRenderEffectRegistry';

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

describe('registerGlRenderEffect', () => {
  it('is a function', () => {
    expect(typeof registerGlRenderEffect).toBe('function');
  });

  it('registers and retrieves a runner', () => {
    const state = createState();
    const runner = vi.fn();
    registerGlRenderEffect(state, 'TestEffect', runner);
    expect(getGlRenderEffectRunner(state, 'TestEffect')).toBe(runner);
  });

  it('overwrites an existing runner under the same kind', () => {
    const state = createState();
    const runnerA = vi.fn();
    const runnerB = vi.fn();
    registerGlRenderEffect(state, 'TestEffect2', runnerA);
    registerGlRenderEffect(state, 'TestEffect2', runnerB);
    expect(getGlRenderEffectRunner(state, 'TestEffect2')).toBe(runnerB);
  });
});

function createState(): GlRenderState {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  return createGlRenderState(canvas);
}
