import { createMatrix } from '@flighthq/geometry';
import type { GlRenderTarget } from '@flighthq/types';

import { beginGlRenderPass, endGlRenderPass, setGlRenderTransform2D } from './glRenderPass';
import { getGlRenderStateRuntime } from './glRenderState';
import { createGlState } from './glTestHelper';

function makeTarget(overrides?: Partial<GlRenderTarget>): GlRenderTarget {
  const texture = { id: 'c0' } as unknown as WebGLTexture;
  return {
    width: 32,
    height: 16,
    format: 'rgba8',
    colorSpace: 'srgb',
    clearColors: [],
    clearDepth: 1,
    sampleCount: 1,
    framebuffer: {} as WebGLFramebuffer,
    resolveFramebuffer: null,
    textures: [texture],
    texture,
    depthTexture: null,
    colorRenderbuffers: [],
    depthStencilRenderbuffer: { id: 'depth' } as unknown as WebGLRenderbuffer,
    ...overrides,
  };
}

describe('beginGlRenderPass', () => {
  it('clears every color attachment and depth by default', () => {
    const { state, gl } = createGlState();
    const clearColor = vi.spyOn(gl, 'clearBufferfv');
    const clearDepth = vi.spyOn(gl, 'clearBufferfi');

    beginGlRenderPass(state, makeTarget());

    expect(clearColor).toHaveBeenCalledWith(gl.COLOR, 0, expect.anything());
    expect(clearDepth).toHaveBeenCalledWith(gl.DEPTH_STENCIL, 0, 1, 0);
  });

  it('spares color when preserveColor is true, still clears depth', () => {
    const { state, gl } = createGlState();
    const clearColor = vi.spyOn(gl, 'clearBufferfv');
    const clearDepth = vi.spyOn(gl, 'clearBufferfi');

    beginGlRenderPass(state, makeTarget(), { preserveColor: true });

    expect(clearColor).not.toHaveBeenCalled();
    expect(clearDepth).toHaveBeenCalled();
  });

  it('spares depth when preserveDepth is true, still clears color', () => {
    const { state, gl } = createGlState();
    const clearColor = vi.spyOn(gl, 'clearBufferfv');
    const clearDepth = vi.spyOn(gl, 'clearBufferfi');

    beginGlRenderPass(state, makeTarget(), { preserveDepth: true });

    expect(clearColor).toHaveBeenCalled();
    expect(clearDepth).not.toHaveBeenCalled();
  });

  it('preserves per attachment location when preserveColor is an array', () => {
    const { state, gl } = createGlState();
    const c0 = { id: 'c0' } as unknown as WebGLTexture;
    const c1 = { id: 'c1' } as unknown as WebGLTexture;
    const clearColor = vi.spyOn(gl, 'clearBufferfv');

    // Keep location 0, clear location 1 — the MRT / G-buffer path.
    beginGlRenderPass(state, makeTarget({ textures: [c0, c1], texture: c0 }), { preserveColor: [true, false] });

    expect(clearColor.mock.calls.map((c) => c[1])).toEqual([1]);
  });

  it("uses the target's packed clearColor over the background color when present", () => {
    const { state, gl } = createGlState({ backgroundColorRgba: [0, 0, 0, 1] });
    const clearColor = vi.spyOn(gl, 'clearBufferfv');

    beginGlRenderPass(state, makeTarget({ clearColors: [0xff0000ff] })); // opaque red

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
    expect(runtime.renderTargetViewport).toEqual({ width: 64, height: 48 });
  });

  it('nests: the inner pass is current until it ends, then the outer is restored', () => {
    const { state } = createGlState();
    const outer = makeTarget({ width: 64, height: 48 });
    const inner = makeTarget({ width: 32, height: 32 });
    const runtime = getGlRenderStateRuntime(state);

    beginGlRenderPass(state, outer);
    beginGlRenderPass(state, inner);
    expect(runtime.currentRenderTarget).toBe(inner);

    endGlRenderPass(state);
    expect(runtime.currentRenderTarget).toBe(outer);
    expect(runtime.renderTargetViewport).toEqual({ width: 64, height: 48 });
  });
});

describe('endGlRenderPass', () => {
  it('restores the framebuffer binding that preceded the pass', () => {
    const { state, gl } = createGlState();
    const target = makeTarget();
    const bindFramebuffer = vi.spyOn(gl, 'bindFramebuffer');

    beginGlRenderPass(state, target);
    endGlRenderPass(state);

    // The pass began with the canvas default bound (null); ending restores it.
    expect(bindFramebuffer.mock.calls.at(-1)?.[1]).toBe(null);
  });

  it('restores the render-target viewport to its pre-pass value (null = canvas)', () => {
    const { state } = createGlState();
    const target = makeTarget();

    beginGlRenderPass(state, target);
    endGlRenderPass(state);

    expect(getGlRenderStateRuntime(state).renderTargetViewport).toBeNull();
  });

  it('is a no-op when there is no matching begin', () => {
    const { state } = createGlState();
    expect(() => endGlRenderPass(state)).not.toThrow();
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

    beginGlRenderPass(state, target, { preserveColor: true });
    setGlRenderTransform2D(state, cacheTransform);
    expect(state.renderTransform2D?.tx).toBe(99);
    endGlRenderPass(state);

    expect(state.renderTransform2D).toBe(original);
  });
});
