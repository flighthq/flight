import { createDisplayObject } from '@flighthq/displayobject';
import { createMatrix, createRectangle } from '@flighthq/geometry';
import type { ClipRegion, DisplayObject, RenderProxy2D } from '@flighthq/types';

import { enableWebGLClipSupport } from './webglClip';
import { makeWebGLState } from './webglTestHelper';

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

describe('enableWebGLClipSupport', () => {
  it('installs the clip hooks on the render state', () => {
    const { state } = makeWebGLState();

    enableWebGLClipSupport(state);

    expect(state.displayObjectClipHooks).not.toBeNull();
    expect(typeof state.displayObjectClipHooks?.pushClip).toBe('function');
    expect(typeof state.displayObjectClipHooks?.popClip).toBe('function');
    expect(typeof state.displayObjectClipHooks?.finalize).toBe('function');
  });

  it('pushClip enables the scissor test for a rectangle clip', () => {
    const { state, gl } = makeWebGLState();
    enableWebGLClipSupport(state);
    const source = createDisplayObject();
    source.clip = makeRectClip();

    state.displayObjectClipHooks?.pushClip(state, makeProxy(source, 1), source);

    expect(gl.enable).toHaveBeenLastCalledWith(gl.SCISSOR_TEST);
    expect(state.clipForms).toEqual(['rect']);
  });

  it('pushClip enables the stencil test for a contour clip', () => {
    const { state, gl } = makeWebGLState();
    enableWebGLClipSupport(state);
    const source = createDisplayObject();
    source.clip = makeContourClip();

    state.displayObjectClipHooks?.pushClip(state, makeProxy(source, 1), source);

    expect(gl.enable).toHaveBeenCalledWith(gl.STENCIL_TEST);
    expect(state.clipForms).toEqual(['contour']);
    expect(state.currentMaskDepth).toBe(1);
  });

  it('pushClip does nothing when the source has no clip', () => {
    const { state } = makeWebGLState();
    enableWebGLClipSupport(state);
    const source = createDisplayObject();

    state.displayObjectClipHooks?.pushClip(state, makeProxy(source, 0), source);

    expect(state.clipForms).toEqual([]);
  });

  it('popClip unwinds forms down to the source parent depth', () => {
    const { state } = makeWebGLState();
    enableWebGLClipSupport(state);
    const source = createDisplayObject();
    source.clip = makeRectClip();
    state.displayObjectClipHooks?.pushClip(state, makeProxy(source, 1), source);

    // A sibling at the same depth carrying its own clip pops the previous one first.
    state.displayObjectClipHooks?.popClip(state, makeProxy(source, 1), source);

    expect(state.clipForms).toEqual([]);
  });

  it('finalize pops every remaining clip form', () => {
    const { state } = makeWebGLState();
    enableWebGLClipSupport(state);
    const rectSource = createDisplayObject();
    rectSource.clip = makeRectClip();
    const contourSource = createDisplayObject();
    contourSource.clip = makeContourClip();
    state.displayObjectClipHooks?.pushClip(state, makeProxy(rectSource, 1), rectSource);
    state.displayObjectClipHooks?.pushClip(state, makeProxy(contourSource, 2), contourSource);

    state.displayObjectClipHooks?.finalize(state);

    expect(state.clipForms).toEqual([]);
  });
});
