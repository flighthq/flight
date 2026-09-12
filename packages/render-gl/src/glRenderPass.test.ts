import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { createMatrix } from '@flighthq/geometry/contract';
import { getOrCreateRenderProxy2D } from '@flighthq/render/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';
import type {
  GlContext,
  GlRenderPass,
  GlRenderTarget,
  GlTextureRenderTarget,
  Viewport,
} from '@flighthq/types/contract';

import { clearGlRenderTarget, clearGlRenderTargetAttachments, fillGlRect } from './glFullscreenPass';
import {
  acquireGlRenderPassHandle,
  beginGlRenderPass,
  endGlRenderPass,
  getGlCurrentRenderPass,
  releaseGlRenderPassHandle,
  setGlRenderTransform2D,
} from './glRenderPass';
import { createGlRenderState, getGlRenderStateRuntime } from './glRenderState';
import { drawGlTextureRenderTargetResult } from './glRenderTarget';
import { createGlState } from './glTestHelper';

function makeTarget(overrides?: Partial<GlTextureRenderTarget>): GlTextureRenderTarget {
  const texture = { id: 'c0' } as unknown as WebGLTexture;
  const out = allocateEntity<GlTextureRenderTarget>();
  out.requestedAxes = {
    width: 32,
    height: 16,
    format: 'rgba8',
    colorAttachments: 1,
    colorFormats: ['rgba8'],
    sampleCount: 1,
    depth: 'depth-stencil',
    colorSpace: 'srgb',
  };
  out.width = 32;
  out.height = 16;
  out.format = 'rgba8';
  out.colorAttachments = 1;
  out.colorFormats = ['rgba8'];
  out.depth = 'depth-stencil';
  out.colorSpace = 'srgb';
  out.sampleCount = 1;
  out.framebuffer = {} as WebGLFramebuffer;
  out.resolveFramebuffer = null;
  out.textures = [texture];
  out.texture = texture;
  out.depthTexture = null;
  out.colorRenderbuffers = [];
  out.depthStencilRenderbuffer = { id: 'depth' } as unknown as WebGLRenderbuffer;
  Object.assign(out, overrides);
  return finishEntity(out);
}

describe('acquireGlRenderPassHandle', () => {
  it('returns a pass with the given gl, state, and target', () => {
    const { state, gl } = createGlState();
    const target = makeTarget();

    const handle = acquireGlRenderPassHandle(gl, state, target);

    expect(handle.gl).toBe(gl);
    expect(handle.state).toBe(state);
    expect(handle.target).toBe(target);
  });

  it('reuses a previously released handle from the same context', () => {
    const { state, gl } = createGlState();
    const target = makeTarget();

    const first = acquireGlRenderPassHandle(gl, state, target);
    releaseGlRenderPassHandle(gl, first);
    const second = acquireGlRenderPassHandle(gl, state, target);

    expect(second).toBe(first);
  });
});

describe('beginGlRenderPass', () => {
  it('clears color and depth when clear descriptor specifies both', () => {
    const { state, gl } = createGlState();
    const clearColor = vi.spyOn(gl, 'clearBufferfv');
    const clearDepth = vi.spyOn(gl, 'clearBufferfi');

    beginGlRenderPass(state, makeTarget(), { color: [0, 0, 0, 0], depth: 1.0, stencil: 0 });

    expect(clearColor).toHaveBeenCalledWith(gl.COLOR, 0, expect.anything());
    expect(clearDepth).toHaveBeenCalledWith(gl.DEPTH_STENCIL, 0, 1, 0);
  });

  it('preserves everything when no clear descriptor is given', () => {
    const { state, gl } = createGlState();
    const clearColor = vi.spyOn(gl, 'clearBufferfv');
    const clearDepth = vi.spyOn(gl, 'clearBufferfi');

    beginGlRenderPass(state, makeTarget());

    expect(clearColor).not.toHaveBeenCalled();
    expect(clearDepth).not.toHaveBeenCalled();
  });

  it('preserves color when color is omitted from clear descriptor', () => {
    const { state, gl } = createGlState();
    const clearColor = vi.spyOn(gl, 'clearBufferfv');
    const clearDepth = vi.spyOn(gl, 'clearBufferfi');

    beginGlRenderPass(state, makeTarget(), { depth: 1.0, stencil: 0 });

    expect(clearColor).not.toHaveBeenCalled();
    expect(clearDepth).toHaveBeenCalled();
  });

  it('preserves depth when depth is omitted from clear descriptor', () => {
    const { state, gl } = createGlState();
    const clearColor = vi.spyOn(gl, 'clearBufferfv');
    const clearDepth = vi.spyOn(gl, 'clearBufferfi');

    beginGlRenderPass(state, makeTarget(), { color: [0, 0, 0, 0] });

    expect(clearColor).toHaveBeenCalled();
    expect(clearDepth).not.toHaveBeenCalled();
  });

  it('clears per-attachment with colors array, skipping undefined entries', () => {
    const { state, gl } = createGlState();
    const c0 = { id: 'c0' } as unknown as WebGLTexture;
    const c1 = { id: 'c1' } as unknown as WebGLTexture;
    const clearColor = vi.spyOn(gl, 'clearBufferfv');

    beginGlRenderPass(state, makeTarget({ textures: [c0, c1], texture: c0 }), {
      colors: [undefined, [0, 0, 0, 0]],
    });

    expect(clearColor.mock.calls.map((c) => c[1])).toEqual([1]);
  });

  it('writes float RGBA values directly to clearBufferfv', () => {
    const { state, gl } = createGlState();
    const clearColor = vi.spyOn(gl, 'clearBufferfv');

    beginGlRenderPass(state, makeTarget(), { color: [1, 0, 0, 1] });

    const rgba = clearColor.mock.calls[0][2] as Float32Array;
    expect(rgba[0]).toBeCloseTo(1);
    expect(rgba[1]).toBeCloseTo(0);
    expect(rgba[3]).toBeCloseTo(1);
  });

  it('binds the target and sets the viewport to its dimensions', () => {
    const { state } = createGlState();
    const target = makeTarget({ width: 64, height: 48 });

    beginGlRenderPass(state, target);

    const runtime = getGlRenderStateRuntime(state);
    expect(runtime.currentRenderTarget).toBe(target);
    expect(runtime.renderTargetViewport).toEqual({ height: 48, width: 64, x: 0, y: 0 });
  });

  it('constrains viewport and clears to a top-left-origin sub-region', () => {
    const { state, gl } = createGlState();
    const target = makeTarget({ width: 100, height: 80 });
    const viewport = makeViewport(10, 20, 30, 40);

    beginGlRenderPass(state, target, { color: [0, 0, 0, 0] }, viewport);

    expect(gl.viewport).toHaveBeenLastCalledWith(10, 20, 30, 40);
    expect(gl.enable).toHaveBeenCalledWith(gl.SCISSOR_TEST);
    expect(gl.scissor).toHaveBeenLastCalledWith(10, 20, 30, 40);
    expect(vi.mocked(gl.scissor).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(gl.clearBufferfv).mock.invocationCallOrder[0],
    );
    expect(getGlRenderStateRuntime(state).renderTargetViewport).toEqual({
      height: 40,
      width: 30,
      x: 10,
      y: 20,
    });
  });

  it('intersects both viewport edges before clamping a negative origin', () => {
    const { state, gl } = createGlState();

    beginGlRenderPass(state, makeTarget({ width: 100, height: 80 }), undefined, makeViewport(-10, -5, 25, 20));

    // Visible top-left intersection is 15×15, not the original 25×20 shifted inward.
    expect(gl.viewport).toHaveBeenLastCalledWith(0, 65, 15, 15);
    expect(gl.scissor).toHaveBeenLastCalledWith(0, 65, 15, 15);
  });

  it('keeps a fractional-origin zero-area viewport empty', () => {
    const { state, gl } = createGlState();

    beginGlRenderPass(state, makeTarget({ width: 100, height: 80 }), undefined, makeViewport(10.5, 20.5, 0, 0));

    expect(gl.viewport).toHaveBeenLastCalledWith(10, 60, 0, 0);
    expect(gl.scissor).toHaveBeenLastCalledWith(10, 60, 0, 0);
  });

  it('keeps a nested full-region pass inside the enclosing scissor', () => {
    const { state, gl } = createGlState();
    const target = makeTarget({ width: 100, height: 80 });

    beginGlRenderPass(state, target, undefined, makeViewport(10, 20, 30, 40));
    beginGlRenderPass(state, target);

    expect(gl.viewport).toHaveBeenLastCalledWith(0, 0, 100, 80);
    expect(gl.scissor).toHaveBeenLastCalledWith(10, 20, 30, 40);
    expect(getGlRenderStateRuntime(state).currentScissorRect).toEqual({ height: 40, width: 30, x: 10, y: 20 });
  });

  it('nests: the inner pass is current until it ends, then the outer is restored', () => {
    const { state } = createGlState();
    const outer = makeTarget({ width: 64, height: 48 });
    const inner = makeTarget({ width: 32, height: 32 });
    const runtime = getGlRenderStateRuntime(state);

    beginGlRenderPass(state, outer);
    const innerPass = beginGlRenderPass(state, inner);
    expect(runtime.currentRenderTarget).toBe(inner);

    endGlRenderPass(innerPass);
    expect(runtime.currentRenderTarget).toBe(outer);
    expect(runtime.renderTargetViewport).toEqual({ height: 48, width: 64, x: 0, y: 0 });
  });

  it('shares pass ownership between render states using the same context', () => {
    const outerFixture = createGlState();
    const innerFixture = createGlState();
    const { gl, state: outerState } = outerFixture;
    const innerState = innerFixture.state;
    (innerState as { gl: GlContext }).gl = gl;
    const outer = makeTarget({ width: 64, height: 48 });
    const inner = makeTarget({ width: 32, height: 24 });

    const outerPass = beginGlRenderPass(outerState, outer);
    const innerPass = beginGlRenderPass(innerState, inner);
    endGlRenderPass(innerPass);

    expect(vi.mocked(gl.bindFramebuffer).mock.calls.at(-1)?.[1]).toBe(outer.framebuffer);
    expect(getGlRenderStateRuntime(outerState).currentRenderTarget).toBe(outer);
    expect(getGlRenderStateRuntime(innerState).currentRenderTarget).toBeNull();
    endGlRenderPass(outerPass);
  });

  it('rejects a same-target contour pass across render states sharing one context', () => {
    const outerFixture = createGlState();
    const innerFixture = createGlState();
    const { gl, state: outerState } = outerFixture;
    const innerState = innerFixture.state;
    (innerState as { gl: GlContext }).gl = gl;
    const target = makeTarget({ width: 64, height: 48 });

    const outerPass = beginGlRenderPass(outerState, target);
    getGlRenderStateRuntime(outerState).currentMaskDepth = 1;

    expect(() => beginGlRenderPass(innerState, target)).toThrow(
      'cannot nest the active framebuffer while a contour clip is live',
    );
    expect(getGlRenderStateRuntime(outerState).currentRenderTarget).toBe(target);
    expect(getGlRenderStateRuntime(innerState).currentRenderTarget).toBeNull();
    endGlRenderPass(outerPass);
  });
});

describe('endGlRenderPass', () => {
  it('restores the framebuffer binding that preceded the pass', () => {
    const { state, gl } = createGlState();
    const target = makeTarget();
    const bindFramebuffer = vi.spyOn(gl, 'bindFramebuffer');

    const pass = beginGlRenderPass(state, target);
    endGlRenderPass(pass);

    // The pass began with the canvas default bound (null); ending restores it.
    expect(bindFramebuffer.mock.calls.at(-1)?.[1]).toBe(null);
  });

  it('restores the render-target viewport to its pre-pass value (null = canvas)', () => {
    const { state } = createGlState();
    const target = makeTarget();

    const pass = beginGlRenderPass(state, target);
    endGlRenderPass(pass);

    expect(getGlRenderStateRuntime(state).renderTargetViewport).toBeNull();
  });

  it('restores the exact enclosing viewport and scissor after a nested pass', () => {
    const { state, gl } = createGlState();
    const target = makeTarget({ width: 100, height: 80 });

    beginGlRenderPass(state, target, undefined, makeViewport(10, 20, 30, 40));
    const innerPass = beginGlRenderPass(state, target, undefined, makeViewport(15, 25, 10, 10));
    endGlRenderPass(innerPass);

    expect(gl.viewport).toHaveBeenLastCalledWith(10, 20, 30, 40);
    expect(gl.scissor).toHaveBeenLastCalledWith(10, 20, 30, 40);
    expect(getGlRenderStateRuntime(state).currentScissorRect).toEqual({ height: 40, width: 30, x: 10, y: 20 });
    expect(getGlRenderStateRuntime(state).scissorStack).toEqual([{ height: 40, width: 30, x: 10, y: 20 }]);
  });

  it('isolates and restores the enclosing logical 2D clip stack', () => {
    const { state } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    const outerClip = { height: 20, width: 20, x: 15, y: 25 };

    beginGlRenderPass(state, makeTarget({ width: 100, height: 80 }), undefined, makeViewport(10, 20, 30, 40));
    runtime.currentScissorRect = outerClip;
    runtime.scissorStack!.push(outerClip);
    runtime.clipForms.push('rect');

    const innerPass = beginGlRenderPass(state, makeTarget({ width: 100, height: 80 }));
    expect(runtime.clipForms).toEqual([]);
    expect(runtime.currentMaskDepth).toBe(0);

    // An inner renderGlScene2D.finalize now has no enclosing entry to drain.
    endGlRenderPass(innerPass);
    expect(runtime.currentScissorRect).toBe(outerClip);
    expect(runtime.scissorStack).toEqual([{ height: 40, width: 30, x: 10, y: 20 }, outerClip]);
    expect(runtime.clipForms).toEqual(['rect']);
  });

  it('restores depth writes after a nested depth-clearing pass', () => {
    const { state, gl } = createGlState();
    let depthMask = true;
    vi.mocked(gl.depthMask).mockImplementation((value) => {
      depthMask = value;
    });
    vi.mocked(gl.getParameter).mockImplementation((parameter) => (parameter === gl.DEPTH_WRITEMASK ? depthMask : null));

    beginGlRenderPass(state, makeTarget(), { color: [0, 0, 0, 0] });
    gl.depthMask(false);
    const innerPass = beginGlRenderPass(state, makeTarget(), { depth: 1.0, stencil: 0 });
    expect(depthMask).toBe(true);
    endGlRenderPass(innerPass);

    expect(depthMask).toBe(false);
  });

  it('isolates and restores an enclosing contour stencil gate', () => {
    const { state, gl } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    runtime.clipForms = ['contour'];
    runtime.currentMaskDepth = 1;

    const pass = beginGlRenderPass(state, makeTarget());
    expect(runtime.clipForms).toEqual([]);
    expect(runtime.currentMaskDepth).toBe(0);
    expect(gl.disable).toHaveBeenCalledWith(gl.STENCIL_TEST);

    endGlRenderPass(pass);
    expect(runtime.clipForms).toEqual(['contour']);
    expect(runtime.currentMaskDepth).toBe(1);
    expect(gl.enable).toHaveBeenCalledWith(gl.STENCIL_TEST);
    expect(gl.stencilMask).toHaveBeenCalled();
    expect(gl.stencilFunc).toHaveBeenCalled();
    expect(gl.stencilOp).toHaveBeenCalled();
  });

  it('disables scissor when the outer partial pass returns to the canvas', () => {
    const { state, gl } = createGlState();

    const pass = beginGlRenderPass(state, makeTarget(), undefined, makeViewport(1, 2, 10, 8));
    endGlRenderPass(pass);

    expect(gl.disable).toHaveBeenCalledWith(gl.SCISSOR_TEST);
    expect(getGlRenderStateRuntime(state).currentScissorRect).toBeNull();
    expect(getGlRenderStateRuntime(state).scissorStack).toEqual([]);
  });

  it('throws when there is no matching begin', () => {
    const { state } = createGlState();
    const mockPass = { gl: state.gl, state, target: {} as GlRenderTarget } as GlRenderPass;
    expect(() => endGlRenderPass(mockPass)).toThrow('without a matching beginGlRenderPass');
  });
});

function makeViewport(x: number, y: number, width: number, height: number): Viewport {
  return { devicePixelRatio: 1, height, width, x, y } as Viewport;
}

describe('getGlCurrentRenderPass', () => {
  it('returns null when no pass is active', () => {
    const { state } = createGlState();

    expect(getGlCurrentRenderPass(state)).toBeNull();
  });

  it('returns the active pass during a render pass', () => {
    const { state } = createGlState();
    const target = makeTarget();

    const pass = beginGlRenderPass(state, target);

    expect(getGlCurrentRenderPass(state)).toBe(pass);
    endGlRenderPass(pass);
  });

  it('returns null after the pass ends', () => {
    const { state } = createGlState();
    const target = makeTarget();

    const pass = beginGlRenderPass(state, target);
    endGlRenderPass(pass);

    expect(getGlCurrentRenderPass(state)).toBeNull();
  });
});

describe('offscreen 2D projection basis', () => {
  // Pins the property a downstream report claimed was broken: that an offscreen state's 2D pass projects
  // into the BOUND TARGET's dimensions rather than the shared context's drawing buffer. Reading the
  // drawing-buffer fallback during an offscreen pass would shrink content non-uniformly while still
  // looking plausible, so this asserts the pass actually populates its explicit viewport.
  it('derives the viewport from the target, not from the shared drawing buffer', () => {
    const { state } = createGlState();
    const offscreen = createGlRenderState(state.gl, state.pipeline);
    const runtime = getGlRenderStateRuntime(offscreen);
    expect(offscreen.gl).toBe(state.gl);
    expect([state.gl.drawingBufferWidth, state.gl.drawingBufferHeight]).toEqual([200, 100]);

    const pass = beginGlRenderPass(offscreen, makeTarget({ width: 64, height: 32 }));

    expect(runtime.renderTargetViewport).toEqual({ height: 32, width: 64, x: 0, y: 0 });
    endGlRenderPass(pass);
  });

  it('restores the previous basis when the pass ends', () => {
    // Guards the guard: a pass that set the viewport and never restored it would satisfy the test above
    // while leaving every later screen draw projecting into the offscreen target's dimensions.
    const { state } = createGlState();
    const offscreen = createGlRenderState(state.gl, state.pipeline);
    const runtime = getGlRenderStateRuntime(offscreen);

    const pass = beginGlRenderPass(offscreen, makeTarget({ width: 64, height: 32 }));
    endGlRenderPass(pass);

    expect(runtime.renderTargetViewport).toBe(null);
  });

  it('starts an offscreen state with the same neutral root transform as a screen state', () => {
    // renderTransform2D is the root DEVICE transform for parentless nodes, not a projection
    // compensation. Identity is the correct neutral for both, and the two constructors agreeing is what
    // makes an offscreen pass behave like a screen pass until a caller deliberately changes it.
    const { state } = createGlState();
    const offscreen = createGlRenderState(state.gl, state.pipeline);

    // Field-by-field, not toEqual: a Matrix is entity-backed and carries runtime identity beyond its
    // public fields, so two structurally identical matrices are not deeply equal.
    const transform = offscreen.renderTransform2D!;
    expect([transform.a, transform.b, transform.c, transform.d, transform.tx, transform.ty]).toEqual([
      1, 0, 0, 1, 0, 0,
    ]);
  });
});

describe('releaseGlRenderPassHandle', () => {
  it('returns a handle to the pool for reuse', () => {
    const { state, gl } = createGlState();
    const target = makeTarget();

    const handle = acquireGlRenderPassHandle(gl, state, target);
    releaseGlRenderPassHandle(gl, handle);
    const reused = acquireGlRenderPassHandle(gl, state, target);

    expect(reused).toBe(handle);
  });

  it('creates the pool lazily on first release', () => {
    const { state, gl } = createGlState();
    const target = makeTarget();
    const handle = acquireGlRenderPassHandle(gl, state, target);

    releaseGlRenderPassHandle(gl, handle);

    const second = acquireGlRenderPassHandle(gl, state, target);
    expect(second).toBe(handle);
  });
});

describe('setGlRenderTransform2D', () => {
  it('installs a copy of the transform as the 2D root device transform', () => {
    const { state } = createGlState();
    const transform = createMatrix();
    transform.tx = 7;

    setGlRenderTransform2D(state, transform);

    expect(state.renderTransform2D?.tx).toBe(7);
    // A copy, not the caller's object — so later caller mutations don't leak into render state.
    expect(state.renderTransform2D).not.toBe(transform);
  });

  it('is undone by the enclosing pass: endGlRenderPass restores the pre-pass transform', () => {
    const { state } = createGlState();
    const original = state.renderTransform2D;
    const target = makeTarget();
    const cacheTransform = createMatrix();
    cacheTransform.tx = 99;

    const pass = beginGlRenderPass(state, target, { depth: 1.0, stencil: 0 });
    setGlRenderTransform2D(state, cacheTransform);
    expect(state.renderTransform2D?.tx).toBe(99);
    endGlRenderPass(pass);

    expect(state.renderTransform2D).toBe(original);
  });

  it('dirties existing state-local proxy transforms for repeated offscreen captures', () => {
    const { state } = createGlState();
    const proxy = getOrCreateRenderProxy2D(state, createDisplayObject());
    proxy.lastLocalTransformId = 7;

    setGlRenderTransform2D(state, createMatrix());

    expect(proxy.lastLocalTransformId).toBe(-1);
  });
});

describe('zero-compat ratchet', () => {
  it('clearGlRenderTarget takes (target, clear) — no state parameter', () => {
    expect(clearGlRenderTarget).toHaveLength(2);
  });

  it('clearGlRenderTargetAttachments takes (target, clear) — no state parameter', () => {
    expect(clearGlRenderTargetAttachments).toHaveLength(2);
  });

  it('fillGlRect first parameter is a pass, not state', () => {
    const { state } = createGlState();
    const target = makeTarget();
    const pass = beginGlRenderPass(state, target);
    expect(pass.gl).toBe(state.gl);
    expect(pass.state).toBe(state);
    expect(pass.target).toBe(target);
    endGlRenderPass(pass);
  });

  it('drawGlTextureRenderTargetResult first parameter is a pass', () => {
    expect(drawGlTextureRenderTargetResult).toHaveLength(4);
  });

  it('beginGlRenderPass returns a GlRenderPass with gl, state, and target', () => {
    const { state } = createGlState();
    const target = makeTarget();
    const pass = beginGlRenderPass(state, target);
    expect(pass).toHaveProperty('gl');
    expect(pass).toHaveProperty('state');
    expect(pass).toHaveProperty('target');
    expect(pass.gl).toBe(state.gl);
    expect(pass.state).toBe(state);
    expect(pass.target).toBe(target);
    endGlRenderPass(pass);
  });

  it('endGlRenderPass accepts GlRenderPass only', () => {
    expect(endGlRenderPass).toHaveLength(1);
  });

  it('getGlCurrentRenderPass tracks the active pass on the state', () => {
    const { state } = createGlState();
    const target = makeTarget();
    expect(getGlCurrentRenderPass(state)).toBeNull();
    const pass = beginGlRenderPass(state, target);
    expect(getGlCurrentRenderPass(state)).toBe(pass);
    endGlRenderPass(pass);
    expect(getGlCurrentRenderPass(state)).toBeNull();
  });

  it('pooled handles are reused across begin/end cycles', () => {
    const { state, gl } = createGlState();
    const target = makeTarget();
    const first = beginGlRenderPass(state, target);
    endGlRenderPass(first);
    const second = beginGlRenderPass(state, target);
    expect(second).toBe(first);
    endGlRenderPass(second);
  });

  it('screen and offscreen states share the context pass pool', () => {
    const { state, gl } = createGlState();
    const offscreen = createGlRenderState(state.gl, state.pipeline);
    const target = makeTarget();
    const screenPass = beginGlRenderPass(state, target);
    endGlRenderPass(screenPass);
    const offscreenPass = beginGlRenderPass(offscreen, target);
    expect(offscreenPass).toBe(screenPass);
    endGlRenderPass(offscreenPass);
  });
});
