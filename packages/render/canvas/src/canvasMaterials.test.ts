import type { CanvasRenderState } from '@flighthq/types';
import { BlendMode } from '@flighthq/types';

import { setCanvasBlendMode } from './canvasMaterials';
import { createCanvasRenderState } from './canvasRenderState';

describe('setCanvasBlendMode', () => {
  let canvas: HTMLCanvasElement;
  let state: CanvasRenderState;

  beforeEach(() => {
    canvas = document.createElement('canvas');
    state = createCanvasRenderState(canvas);
  });

  it('should not change globalCompositeOperation if blend mode is the same', () => {
    state.currentBlendMode = BlendMode.Lighten;
    state.context.globalCompositeOperation = 'lighter'; // Pre-set value
    setCanvasBlendMode(state, BlendMode.Add);
    expect(state.context.globalCompositeOperation).toBe('lighter');
  });

  it('should set globalCompositeOperation to "lighter" for BlendMode.Add', () => {
    setCanvasBlendMode(state, BlendMode.Add);
    expect(state.context.globalCompositeOperation).toBe('lighter');
  });

  it('should set globalCompositeOperation to "darken" for BlendMode.Darken', () => {
    setCanvasBlendMode(state, BlendMode.Darken);
    expect(state.context.globalCompositeOperation).toBe('darken');
  });

  it('should set globalCompositeOperation to "difference" for BlendMode.Difference', () => {
    setCanvasBlendMode(state, BlendMode.Difference);
    expect(state.context.globalCompositeOperation).toBe('difference');
  });

  it('should set globalCompositeOperation to "hard-light" for BlendMode.Hardlight', () => {
    setCanvasBlendMode(state, BlendMode.Hardlight);
    expect(state.context.globalCompositeOperation).toBe('hard-light');
  });

  it('should set globalCompositeOperation to "lighten" for BlendMode.Lighten', () => {
    setCanvasBlendMode(state, BlendMode.Lighten);
    expect(state.context.globalCompositeOperation).toBe('lighten');
  });

  it('should set globalCompositeOperation to "multiply" for BlendMode.Multiply', () => {
    setCanvasBlendMode(state, BlendMode.Multiply);
    expect(state.context.globalCompositeOperation).toBe('multiply');
  });

  it('should set globalCompositeOperation to "overlay" for BlendMode.Overlay', () => {
    setCanvasBlendMode(state, BlendMode.Overlay);
    expect(state.context.globalCompositeOperation).toBe('overlay');
  });

  it('should set globalCompositeOperation to "screen" for BlendMode.Screen', () => {
    setCanvasBlendMode(state, BlendMode.Screen);
    expect(state.context.globalCompositeOperation).toBe('screen');
  });

  it('should set globalCompositeOperation to "source-over" for default case', () => {
    setCanvasBlendMode(state, null);
    expect(state.context.globalCompositeOperation).toBe('source-over');
  });
});
