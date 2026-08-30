import { srgbChannelToLinear } from '@flighthq/color/contract';

import { renderGlBackground } from './glBackground';
import { getGlRenderStateRuntime } from './glRenderState';
import { createGlState } from './glTestHelper';

describe('renderGlBackground', () => {
  it('calls clearColor with zeros when background alpha is 0', () => {
    const { state, gl } = createGlState({ backgroundColorRgba: [0, 0, 0, 0] });
    renderGlBackground(state);
    expect(gl.clearColor).toHaveBeenCalledWith(0, 0, 0, 0);
  });

  it('calls clearColor with the RGBA values when background is non-transparent', () => {
    const { state, gl } = createGlState({ backgroundColorRgba: [1, 0, 0, 1] });
    renderGlBackground(state);
    expect(gl.clearColor).toHaveBeenCalledWith(1, 0, 0, 1);
  });

  it('calls clearColor with zeros when RGBA array has fewer than 4 elements', () => {
    const { state, gl } = createGlState({ backgroundColorRgba: [] });
    renderGlBackground(state);
    expect(gl.clearColor).toHaveBeenCalledWith(0, 0, 0, 0);
  });

  it('always calls gl.clear with COLOR_BUFFER_BIT', () => {
    const { state, gl } = createGlState();
    renderGlBackground(state);
    expect(gl.clear).toHaveBeenCalledWith((gl as unknown as { COLOR_BUFFER_BIT: number }).COLOR_BUFFER_BIT);
  });

  it('preserves an active partial-target viewport origin', () => {
    const { state, gl } = createGlState();
    getGlRenderStateRuntime(state).renderTargetViewport = { height: 40, width: 30, x: 10, y: 20 };

    renderGlBackground(state);

    expect(gl.viewport).toHaveBeenLastCalledWith(10, 20, 30, 40);
  });

  it('invalidates currentBlendSignature', () => {
    const { state } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    runtime.context.currentBlendSignature = { dst: 0, equation: 0, src: 0 };
    renderGlBackground(state);
    expect(runtime.context.currentBlendSignature).toBeNull();
  });

  it('passes fractional RGBA values through unchanged', () => {
    const { state, gl } = createGlState({ backgroundColorRgba: [0.5, 0.25, 0.75, 0.8] });
    renderGlBackground(state);
    expect(gl.clearColor).toHaveBeenCalledWith(0.5, 0.25, 0.75, 0.8);
  });

  it('decodes an sRGB background when the active target stores linear scene color', () => {
    const { state, gl } = createGlState({ backgroundColorRgba: [0.5, 0.25, 0.75, 0.8] });
    getGlRenderStateRuntime(state).currentRenderTarget = { colorSpace: 'linear' } as never;

    renderGlBackground(state);

    expect(gl.clearColor).toHaveBeenCalledWith(
      srgbChannelToLinear(0.5),
      srgbChannelToLinear(0.25),
      srgbChannelToLinear(0.75),
      0.8,
    );
  });
});
