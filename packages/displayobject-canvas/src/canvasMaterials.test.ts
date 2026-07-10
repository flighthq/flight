import type { CanvasRenderState } from '@flighthq/types';
import { BlendMode } from '@flighthq/types';

import { applyCanvasBlendMode, enableCanvasBlendMode } from './canvasMaterials';
import { createCanvasRenderState, getCanvasRenderStateRuntime } from './canvasRenderState';

describe('applyCanvasBlendMode', () => {
  let canvas: HTMLCanvasElement;
  let state: CanvasRenderState;

  beforeEach(() => {
    canvas = document.createElement('canvas');
    state = createCanvasRenderState(canvas);
  });

  it('should not change globalCompositeOperation if blend mode is the same', () => {
    getCanvasRenderStateRuntime(state).currentBlendMode = BlendMode.Lighten;
    state.context.globalCompositeOperation = 'lighter'; // Pre-set value
    applyCanvasBlendMode(state, BlendMode.Add);
    expect(state.context.globalCompositeOperation).toBe('lighter');
  });

  it('should set globalCompositeOperation to "lighter" for BlendMode.Add', () => {
    applyCanvasBlendMode(state, BlendMode.Add);
    expect(state.context.globalCompositeOperation).toBe('lighter');
  });

  it('should set globalCompositeOperation to "darken" for BlendMode.Darken', () => {
    applyCanvasBlendMode(state, BlendMode.Darken);
    expect(state.context.globalCompositeOperation).toBe('darken');
  });

  it('should set globalCompositeOperation to "difference" for BlendMode.Difference', () => {
    applyCanvasBlendMode(state, BlendMode.Difference);
    expect(state.context.globalCompositeOperation).toBe('difference');
  });

  it('should set globalCompositeOperation to "hard-light" for BlendMode.HardLight', () => {
    applyCanvasBlendMode(state, BlendMode.HardLight);
    expect(state.context.globalCompositeOperation).toBe('hard-light');
  });

  it('should set globalCompositeOperation to "lighten" for BlendMode.Lighten', () => {
    applyCanvasBlendMode(state, BlendMode.Lighten);
    expect(state.context.globalCompositeOperation).toBe('lighten');
  });

  it('should set globalCompositeOperation to "multiply" for BlendMode.Multiply', () => {
    applyCanvasBlendMode(state, BlendMode.Multiply);
    expect(state.context.globalCompositeOperation).toBe('multiply');
  });

  it('should set globalCompositeOperation to "overlay" for BlendMode.Overlay', () => {
    applyCanvasBlendMode(state, BlendMode.Overlay);
    expect(state.context.globalCompositeOperation).toBe('overlay');
  });

  it('should set globalCompositeOperation to "screen" for BlendMode.Screen', () => {
    applyCanvasBlendMode(state, BlendMode.Screen);
    expect(state.context.globalCompositeOperation).toBe('screen');
  });

  it('should set globalCompositeOperation to "source-over" for default case', () => {
    applyCanvasBlendMode(state, null);
    expect(state.context.globalCompositeOperation).toBe('source-over');
  });
});

describe('enableCanvasBlendMode', () => {
  it('wires applyBlendMode onto the state', () => {
    const canvas = document.createElement('canvas');
    const s = createCanvasRenderState(canvas);
    expect(s.applyBlendMode).toBeNull();
    enableCanvasBlendMode(s);
    expect(s.applyBlendMode).not.toBeNull();
  });

  it('causes blend modes to be applied to the canvas context', () => {
    const canvas = document.createElement('canvas');
    const s = createCanvasRenderState(canvas);
    enableCanvasBlendMode(s);
    s.applyBlendMode!(s, BlendMode.Multiply);
    expect(s.context.globalCompositeOperation).toBe('multiply');
  });
});
