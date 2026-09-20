import { getCanvasRenderStateRuntime } from '@flighthq/scene2d-canvas/contract';
import type { CanvasEffectRunner } from '@flighthq/types/contract';

import { getCanvasEffectRunner, hasCanvasEffectRunner, registerCanvasEffect } from './canvasEffectRegistry';
import { createCanvasRenderState } from './canvasEffectTestSupport';

describe('getCanvasEffectRunner', () => {
  it('is a function', () => {
    expect(typeof getCanvasEffectRunner).toBe('function');
  });

  it('returns null for an unregistered kind', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    expect(getCanvasEffectRunner(state, 'UnknownEffect')).toBeNull();
  });
});

describe('hasCanvasEffectRunner', () => {
  it('is a function', () => {
    expect(typeof hasCanvasEffectRunner).toBe('function');
  });
  it('returns false when state has no registered runners', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    expect(hasCanvasEffectRunner(state, 'NotRegisteredEffect')).toBe(false);
  });
  it('returns true after registering a runner for the given kind', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const fakeRunner = (() => {}) as unknown as CanvasEffectRunner;
    registerCanvasEffect(state, 'HasTestEffect', fakeRunner);
    expect(hasCanvasEffectRunner(state, 'HasTestEffect')).toBe(true);
  });
  it('returns false for a different kind on the same state', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const fakeRunner = (() => {}) as unknown as CanvasEffectRunner;
    registerCanvasEffect(state, 'OnlyThisEffect', fakeRunner);
    expect(hasCanvasEffectRunner(state, 'OtherEffect')).toBe(false);
  });
});

describe('registerCanvasEffect', () => {
  it('is a function', () => {
    expect(typeof registerCanvasEffect).toBe('function');
  });

  it('registers through a replacement without mutating the earlier snapshot', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const runner = (() => {}) as unknown as CanvasEffectRunner;
    const before = getCanvasRenderStateRuntime(state).registries.effects;

    registerCanvasEffect(state, 'TestEffect', runner);

    expect(getCanvasEffectRunner(state, 'TestEffect')).toBe(runner);
    expect(getCanvasRenderStateRuntime(state).registries.effects).not.toBe(before);
    expect(before.entries.size).toBe(0);
  });

  it('is last-write-wins without mutating the earlier snapshot', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const runnerA = (() => {}) as unknown as CanvasEffectRunner;
    const runnerB = (() => {}) as unknown as CanvasEffectRunner;
    registerCanvasEffect(state, 'TestEffect2', runnerA);
    const before = getCanvasRenderStateRuntime(state).registries.effects;

    registerCanvasEffect(state, 'TestEffect2', runnerB);

    expect(getCanvasEffectRunner(state, 'TestEffect2')).toBe(runnerB);
    expect(before.entries.get('TestEffect2')).toEqual({ state: 'bound', value: runnerA });
  });
});
