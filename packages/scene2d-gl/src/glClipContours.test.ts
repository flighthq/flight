import { createMatrix } from '@flighthq/geometry/contract';
import { createViewport } from '@flighthq/node/contract';
import {
  beginGlRenderPass,
  createGlRenderTarget,
  endGlRenderPass,
  getGlRenderStateRuntime,
} from '@flighthq/render-gl/contract';
import { createRenderCache } from '@flighthq/render/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';

import { createGlCacheState, ensureGlRenderCacheTarget, refreshGlRenderCache } from './glCache';
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
  it('rejects a shared-context cache refresh into the contour target before it can clear coverage', () => {
    const { state, gl } = createGlState();
    const cache = createRenderCache();
    const cacheState = createGlCacheState(state);
    const source = createDisplayObject();
    const target = ensureGlRenderCacheTarget(state, cache, 1, 1);
    beginGlRenderPass(state, target, { preserveDepth: true });
    pushGlClipContours(state, SQUARE, 'nonZero', createMatrix());
    gl.depthMask(false);
    const stencilClearCount = vi.mocked(gl.clear).mock.calls.length;

    expect(() => refreshGlRenderCache(cacheState, cache, source)).toThrow(
      'cannot nest the active framebuffer while a contour clip is live',
    );

    expect(gl.clear).toHaveBeenCalledTimes(stencilClearCount);
    expect(getGlRenderStateRuntime(state).currentMaskDepth).toBe(1);
    endGlRenderPass(state);
  });

  it('restores the outer framebuffer after a shared-context cache refresh into another target', () => {
    const { state, gl } = createGlState();
    const cacheState = createGlCacheState(state);
    const outer = createGlRenderTarget(state, {
      depth: 'depth-stencil',
      height: 64,
      width: 64,
    });
    const viewport = createViewport({
      devicePixelRatio: 1,
      height: 16,
      width: 24,
      x: 4,
      y: 5,
    });

    beginGlRenderPass(state, outer, { preserveDepth: true }, viewport);
    const outerScissor = getGlRenderStateRuntime(state).currentScissorRect;
    refreshGlRenderCache(cacheState, createRenderCache(), createDisplayObject());

    expect(vi.mocked(gl.bindFramebuffer).mock.calls.at(-1)?.[1]).toBe(outer.framebuffer);
    expect(getGlRenderStateRuntime(state).currentFramebuffer).toBe(outer.framebuffer);
    expect(getGlRenderStateRuntime(state).currentScissorRect).toEqual(outerScissor);
    endGlRenderPass(state);
  });

  it('enables the stencil test and clears the buffer when opening the first clip', () => {
    const { state, gl } = createGlState();

    pushGlClipContours(state, SQUARE, 'nonZero', createMatrix());

    expect(gl.enable).toHaveBeenCalledWith(gl.STENCIL_TEST);
    expect(gl.clear).toHaveBeenCalledWith(gl.STENCIL_BUFFER_BIT);
    expect(getGlRenderStateRuntime(state).currentMaskDepth).toBe(1);
  });

  it('syncs state.currentShader to the clip program so content draws re-bind their own program', () => {
    const { state } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    expect(runtime.currentShader).toBeNull();

    pushGlClipContours(state, SQUARE, 'nonZero', createMatrix());

    // The clip binds its own position-only program; recording it forces the next content draw to detect
    // the change and re-bind, instead of setting its uniforms against the clip program.
    expect(runtime.currentShader).not.toBeNull();
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
