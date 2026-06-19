import { setRenderStateBackgroundColor } from '@flighthq/render';
import type { CanvasRenderState } from '@flighthq/types';
import { BlendMode } from '@flighthq/types';

import { renderCanvasBackground } from './canvasBackground';
import { createCanvasRenderState, getCanvasRenderStateRuntime } from './canvasRenderState';

function makeState(): { canvas: HTMLCanvasElement; state: CanvasRenderState } {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 100;
  const state = createCanvasRenderState(canvas);
  return { canvas, state };
}

describe('renderCanvasBackground', () => {
  it('calls clearRect when background alpha is 0', () => {
    const { state } = makeState();
    setRenderStateBackgroundColor(state, 0x00000000); // alpha = 0
    const clearSpy = vi.spyOn(state.context, 'clearRect');

    renderCanvasBackground(state);

    expect(clearSpy).toHaveBeenCalledWith(0, 0, state.canvas.width, state.canvas.height);
  });

  it('calls fillRect when background has non-zero alpha', () => {
    const { state } = makeState();
    setRenderStateBackgroundColor(state, 0xff0000ff); // alpha = 0xff
    const fillSpy = vi.spyOn(state.context, 'fillRect');

    renderCanvasBackground(state);

    expect(fillSpy).toHaveBeenCalledWith(0, 0, state.canvas.width, state.canvas.height);
  });

  it('resets transform to identity before drawing', () => {
    const { state } = makeState();
    const setTransformSpy = vi.spyOn(state.context, 'setTransform');

    renderCanvasBackground(state);

    expect(setTransformSpy).toHaveBeenCalledWith(1, 0, 0, 1, 0, 0);
  });

  it('sets globalAlpha to 1 before drawing', () => {
    const { state } = makeState();
    state.context.globalAlpha = 0.5;

    renderCanvasBackground(state);

    expect(state.context.globalAlpha).toBe(1);
  });

  it('resets to normal compositing directly, without using the blend-mode map', () => {
    const { state } = makeState();
    getCanvasRenderStateRuntime(state).currentBlendMode = BlendMode.Multiply;
    state.context.globalCompositeOperation = 'multiply';

    renderCanvasBackground(state);

    expect(getCanvasRenderStateRuntime(state).currentBlendMode).toBe(BlendMode.Normal);
    expect(state.context.globalCompositeOperation).toBe('source-over');
  });
});
