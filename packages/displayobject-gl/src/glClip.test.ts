import { createDisplayObject } from '@flighthq/displayobject';
import { createMatrix, createRectangle } from '@flighthq/geometry';
import { getGlRenderStateRuntime } from '@flighthq/render-gl';
import type { ClipRegion, DisplayObject, RenderProxy2D } from '@flighthq/types';

import { enableGlClipSupport } from './glClip';
import { createGlState } from './glTestHelper';

function makeRectClip(): ClipRegion {
  return { rect: createRectangle(0, 0, 50, 50), contours: null, winding: 'nonZero', version: 0 };
}

function makeContourClip(): ClipRegion {
  return {
    rect: createRectangle(0, 0, 50, 50),
    contours: [[0, 0, 50, 0, 50, 50, 0, 50]],
    winding: 'nonZero',
    version: 0,
  };
}

function makeProxy(source: DisplayObject, clipDepth: number): RenderProxy2D {
  return { source, transform2D: createMatrix(), clipDepth } as unknown as RenderProxy2D;
}

describe('enableGlClipSupport', () => {
  it('installs the clip hooks on the render state', () => {
    const { state } = createGlState();

    enableGlClipSupport(state);

    expect(state.displayObjectClipHooks).not.toBeNull();
    expect(typeof state.displayObjectClipHooks?.pushClip).toBe('function');
    expect(typeof state.displayObjectClipHooks?.popClip).toBe('function');
    expect(typeof state.displayObjectClipHooks?.finalize).toBe('function');
  });

  it('pushClip enables the scissor test for a rectangle clip', () => {
    const { state, gl } = createGlState();
    enableGlClipSupport(state);
    const source = createDisplayObject();
    source.clip = makeRectClip();

    state.displayObjectClipHooks?.pushClip(state, makeProxy(source, 1), source);

    expect(gl.enable).toHaveBeenLastCalledWith(gl.SCISSOR_TEST);
    expect(getGlRenderStateRuntime(state).clipForms).toEqual(['rect']);
  });

  it('pushClip enables the stencil test for a contour clip', () => {
    const { state, gl } = createGlState();
    enableGlClipSupport(state);
    const source = createDisplayObject();
    source.clip = makeContourClip();

    state.displayObjectClipHooks?.pushClip(state, makeProxy(source, 1), source);

    expect(gl.enable).toHaveBeenCalledWith(gl.STENCIL_TEST);
    const runtime = getGlRenderStateRuntime(state);
    expect(runtime.clipForms).toEqual(['contour']);
    expect(runtime.currentMaskDepth).toBe(1);
  });

  it('pushClip does nothing when the source has no clip', () => {
    const { state } = createGlState();
    enableGlClipSupport(state);
    const source = createDisplayObject();

    state.displayObjectClipHooks?.pushClip(state, makeProxy(source, 0), source);

    expect(getGlRenderStateRuntime(state).clipForms).toEqual([]);
  });

  it('popClip unwinds forms down to the source parent depth', () => {
    const { state } = createGlState();
    enableGlClipSupport(state);
    const source = createDisplayObject();
    source.clip = makeRectClip();
    state.displayObjectClipHooks?.pushClip(state, makeProxy(source, 1), source);

    // A sibling at the same depth carrying its own clip pops the previous one first.
    state.displayObjectClipHooks?.popClip(state, makeProxy(source, 1), source);

    expect(getGlRenderStateRuntime(state).clipForms).toEqual([]);
  });

  it('finalize pops every remaining clip form', () => {
    const { state } = createGlState();
    enableGlClipSupport(state);
    const rectSource = createDisplayObject();
    rectSource.clip = makeRectClip();
    const contourSource = createDisplayObject();
    contourSource.clip = makeContourClip();
    state.displayObjectClipHooks?.pushClip(state, makeProxy(rectSource, 1), rectSource);
    state.displayObjectClipHooks?.pushClip(state, makeProxy(contourSource, 2), contourSource);

    state.displayObjectClipHooks?.finalize(state);

    expect(getGlRenderStateRuntime(state).clipForms).toEqual([]);
  });
});
