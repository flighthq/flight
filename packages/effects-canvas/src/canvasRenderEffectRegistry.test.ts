import { createCanvasRenderState } from '@flighthq/scene2d-canvas/contract';
import type { CanvasRenderEffectRunner } from '@flighthq/types/contract';

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
});
