import type { CanvasRenderEffectRunner, CanvasRenderState } from '@flighthq/types';

import {
  getCanvasRenderEffectRunner,
  hasCanvasRenderEffectRunner,
  registerCanvasRenderEffect,
} from './canvasRenderEffectRegistry';

describe('getCanvasRenderEffectRunner', () => {
  it('is a function', () => {
    expect(typeof getCanvasRenderEffectRunner).toBe('function');
  });
});

describe('hasCanvasRenderEffectRunner', () => {
  it('is a function', () => {
    expect(typeof hasCanvasRenderEffectRunner).toBe('function');
  });
  it('returns false when state has no registered runners', () => {
    const fakeState = {} as CanvasRenderState;
    expect(hasCanvasRenderEffectRunner(fakeState, 'NotRegisteredEffect')).toBe(false);
  });
  it('returns true after registering a runner for the given kind', () => {
    const fakeState = {} as CanvasRenderState;
    const fakeRunner = (() => {}) as unknown as CanvasRenderEffectRunner;
    registerCanvasRenderEffect(fakeState, 'HasTestEffect', fakeRunner);
    expect(hasCanvasRenderEffectRunner(fakeState, 'HasTestEffect')).toBe(true);
  });
  it('returns false for a different kind on the same state', () => {
    const fakeState = {} as CanvasRenderState;
    const fakeRunner = (() => {}) as unknown as CanvasRenderEffectRunner;
    registerCanvasRenderEffect(fakeState, 'OnlyThisEffect', fakeRunner);
    expect(hasCanvasRenderEffectRunner(fakeState, 'OtherEffect')).toBe(false);
  });
});

describe('registerCanvasRenderEffect', () => {
  it('is a function', () => {
    expect(typeof registerCanvasRenderEffect).toBe('function');
  });
});
