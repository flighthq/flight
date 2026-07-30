import { createMatrix } from '@flighthq/geometry/contract';
import {
  beginGlRenderPass,
  createGlRenderTarget,
  endGlRenderPass,
  getGlRenderStateRuntime,
} from '@flighthq/render-gl/contract';

import { popGlClipContours, pushGlClipContours } from './glClipContours';
import { createGlState } from './glTestHelper';

const SQUARE = [[0, 0, 50, 0, 50, 50, 0, 50]];

describe('popGlClipContours', () => {
  it('decrements the stencil depth and disables the stencil test at depth 0', () => {
    const { state, gl } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    pushGlClipContours(state, SQUARE, 'nonZero', createMatrix());
    expect(runtime.currentMaskDepth).toBe(1);

    popGlClipContours(state);

    expect(runtime.currentMaskDepth).toBe(0);
    expect(gl.disable).toHaveBeenCalledWith(gl.STENCIL_TEST);
  });
});

describe('pushGlClipContours', () => {
  it('rejects a same-target nested pass before it can clear live contour coverage', () => {
    const { state, gl } = createGlState();
    const target = createGlRenderTarget(state, {
      depth: 'depth-stencil',
      height: 64,
      width: 64,
    });
    beginGlRenderPass(state, target, { preserveDepth: true });
    pushGlClipContours(state, SQUARE, 'nonZero', createMatrix());
    gl.depthMask(false);
    const stencilClearCount = vi.mocked(gl.clear).mock.calls.length;

    expect(() =>
      beginGlRenderPass(state, target, {
        preserveColor: true,
        preserveDepth: true,
      }),
    ).toThrow('cannot nest the active framebuffer while a contour clip is live');

    expect(gl.clear).toHaveBeenCalledTimes(stencilClearCount);
    expect(getGlRenderStateRuntime(state).currentMaskDepth).toBe(1);
    endGlRenderPass(state);
  });

  it('enables the stencil test and clears the buffer when opening the first clip', () => {
    const { state, gl } = createGlState();

    pushGlClipContours(state, SQUARE, 'nonZero', createMatrix());

    expect(gl.enable).toHaveBeenCalledWith(gl.STENCIL_TEST);
    expect(gl.clear).toHaveBeenCalledWith(gl.STENCIL_BUFFER_BIT);
    expect(getGlRenderStateRuntime(state).currentMaskDepth).toBe(1);
  });

  it('syncs state.currentProgram to the clip program so content draws re-bind their own program', () => {
    const { state } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    expect(runtime.currentProgram).toBeNull();

    pushGlClipContours(state, SQUARE, 'nonZero', createMatrix());

    // The clip binds its own position-only program; recording it forces the next content draw to detect
    // the change and re-bind, instead of setting its uniforms against the clip program.
    expect(runtime.currentProgram).not.toBeNull();
  });

  it('re-enables color writes after stencilling so gated content is drawn', () => {
    const { state, gl } = createGlState();

    pushGlClipContours(state, SQUARE, 'nonZero', createMatrix());

    expect(gl.colorMask).toHaveBeenLastCalledWith(true, true, true, true);
  });

  it('uses the even-odd stencil op for an evenOdd winding', () => {
    const { state, gl } = createGlState();

    pushGlClipContours(state, SQUARE, 'evenOdd', createMatrix());

    expect(gl.stencilOp).toHaveBeenCalledWith(gl.KEEP, gl.KEEP, gl.INVERT);
  });
});
