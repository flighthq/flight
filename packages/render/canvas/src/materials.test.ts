import type { CanvasRenderState } from '@flighthq/types';
import { BlendMode } from '@flighthq/types';

import { setBlendMode } from './materials';
import { createRenderState } from './renderState';

describe('setBlendMode', () => {
  let canvas: HTMLCanvasElement;
  let state: CanvasRenderState;

  beforeEach(() => {
    canvas = document.createElement('canvas');
    state = createRenderState(canvas);
  });

  it('should not change globalCompositeOperation if blend mode is the same', () => {
    state.currentBlendMode = BlendMode.Lighten;
    state.context.globalCompositeOperation = 'lighter'; // Pre-set value
    setBlendMode(state, BlendMode.Add);
    expect(state.context.globalCompositeOperation).toBe('lighter');
  });

  it('should set globalCompositeOperation to "lighter" for BlendMode.Add', () => {
    setBlendMode(state, BlendMode.Add);
    expect(state.context.globalCompositeOperation).toBe('lighter');
  });

  it('should set globalCompositeOperation to "darken" for BlendMode.Darken', () => {
    setBlendMode(state, BlendMode.Darken);
    expect(state.context.globalCompositeOperation).toBe('darken');
  });

  it('should set globalCompositeOperation to "difference" for BlendMode.Difference', () => {
    setBlendMode(state, BlendMode.Difference);
    expect(state.context.globalCompositeOperation).toBe('difference');
  });

  it('should set globalCompositeOperation to "hard-light" for BlendMode.Hardlight', () => {
    setBlendMode(state, BlendMode.Hardlight);
    expect(state.context.globalCompositeOperation).toBe('hard-light');
  });

  it('should set globalCompositeOperation to "lighten" for BlendMode.Lighten', () => {
    setBlendMode(state, BlendMode.Lighten);
    expect(state.context.globalCompositeOperation).toBe('lighten');
  });

  it('should set globalCompositeOperation to "multiply" for BlendMode.Multiply', () => {
    setBlendMode(state, BlendMode.Multiply);
    expect(state.context.globalCompositeOperation).toBe('multiply');
  });

  it('should set globalCompositeOperation to "overlay" for BlendMode.Overlay', () => {
    setBlendMode(state, BlendMode.Overlay);
    expect(state.context.globalCompositeOperation).toBe('overlay');
  });

  it('should set globalCompositeOperation to "screen" for BlendMode.Screen', () => {
    setBlendMode(state, BlendMode.Screen);
    expect(state.context.globalCompositeOperation).toBe('screen');
  });

  it('should set globalCompositeOperation to "source-over" for default case', () => {
    setBlendMode(state, null);
    expect(state.context.globalCompositeOperation).toBe('source-over');
  });
});
