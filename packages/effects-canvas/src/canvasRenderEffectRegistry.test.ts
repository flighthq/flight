import { getCanvasRenderStateRuntime } from '@flighthq/scene2d-canvas/contract';
import type { CanvasRenderEffectRunner } from '@flighthq/types/contract';

import { createCanvasRenderState } from './canvasEffectTestSupport';
import {
  getCanvasRenderEffectRunner,
  hasCanvasRenderEffectRunner,
  registerCanvasRenderEffect,
} from './canvasRenderEffectRegistry';

describe('getCanvasRenderEffectRunner', () => {
  it('is a function', () => {
    expect(typeof getCanvasRenderEffectRunner).toBe('function');
  });

  it('returns null for an unregistered kind', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    expect(getCanvasRenderEffectRunner(state, 'UnknownEffect')).toBeNull();
  });
});

describe('hasCanvasRenderEffectRunner', () => {
  it('is a function', () => {
    expect(typeof hasCanvasRenderEffectRunner).toBe('function');
  });
  it('returns false when state has no registered runners', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    expect(hasCanvasRenderEffectRunner(state, 'NotRegisteredEffect')).toBe(false);
  });
  it('returns true after registering a runner for the given kind', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const fakeRunner = (() => {}) as unknown as CanvasRenderEffectRunner;
    registerCanvasRenderEffect(state, 'HasTestEffect', fakeRunner);
    expect(hasCanvasRenderEffectRunner(state, 'HasTestEffect')).toBe(true);
  });
  it('returns false for a different kind on the same state', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const fakeRunner = (() => {}) as unknown as CanvasRenderEffectRunner;
    registerCanvasRenderEffect(state, 'OnlyThisEffect', fakeRunner);
    expect(hasCanvasRenderEffectRunner(state, 'OtherEffect')).toBe(false);
  });
});

describe('registerCanvasRenderEffect', () => {
  it('is a function', () => {
    expect(typeof registerCanvasRenderEffect).toBe('function');
  });

  it('registers through a replacement without mutating the earlier snapshot', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const runner = (() => {}) as unknown as CanvasRenderEffectRunner;
    const before = getCanvasRenderStateRuntime(state).registries.renderEffects;

    registerCanvasRenderEffect(state, 'TestEffect', runner);

    expect(getCanvasRenderEffectRunner(state, 'TestEffect')).toBe(runner);
    expect(getCanvasRenderStateRuntime(state).registries.renderEffects).not.toBe(before);
    expect(before.entries.size).toBe(0);
  });

  it('is last-write-wins without mutating the earlier snapshot', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const runnerA = (() => {}) as unknown as CanvasRenderEffectRunner;
    const runnerB = (() => {}) as unknown as CanvasRenderEffectRunner;
    registerCanvasRenderEffect(state, 'TestEffect2', runnerA);
    const before = getCanvasRenderStateRuntime(state).registries.renderEffects;

    registerCanvasRenderEffect(state, 'TestEffect2', runnerB);

    expect(getCanvasRenderEffectRunner(state, 'TestEffect2')).toBe(runnerB);
    expect(before.entries.get('TestEffect2')).toEqual({ state: 'bound', value: runnerA });
  });
});
