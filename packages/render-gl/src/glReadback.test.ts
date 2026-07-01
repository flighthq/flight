import type { GlRenderTarget } from '@flighthq/types';

import { readGlRenderTargetPixels } from './glReadback';
import { createGlState } from './glTestHelper';

function makeTarget(overrides?: Partial<GlRenderTarget>): GlRenderTarget {
  return {
    width: 4,
    height: 4,
    format: 'rgba8',
    sampleCount: 1,
    framebuffer: {} as WebGLFramebuffer,
    resolveFramebuffer: null,
    textures: [{} as WebGLTexture],
    texture: {} as WebGLTexture,
    depthTexture: null,
    colorRenderbuffers: [],
    depthStencilRenderbuffer: null,
    ...overrides,
  } as GlRenderTarget;
}

describe('readGlRenderTargetPixels', () => {
  it('returns false for a zero-width target', () => {
    const { state } = createGlState();
    const target = makeTarget({ width: 0, height: 4 });
    const out = new Uint8Array(16);
    expect(readGlRenderTargetPixels(state, target, 0, 0, 1, 1, out)).toBe(false);
  });

  it('returns false for a zero-height target', () => {
    const { state } = createGlState();
    const target = makeTarget({ width: 4, height: 0 });
    const out = new Uint8Array(16);
    expect(readGlRenderTargetPixels(state, target, 0, 0, 1, 1, out)).toBe(false);
  });

  it('returns false when the framebuffer is incomplete', () => {
    const { state } = createGlState();
    const target = makeTarget();
    vi.spyOn(state.gl, 'checkFramebufferStatus').mockReturnValue(state.gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT ?? 36054);
    const out = new Uint8Array(16);
    expect(readGlRenderTargetPixels(state, target, 0, 0, 1, 1, out)).toBe(false);
  });

  it('returns true and calls readPixels when the framebuffer is complete', () => {
    const { state } = createGlState();
    const target = makeTarget();
    vi.spyOn(state.gl, 'checkFramebufferStatus').mockReturnValue(state.gl.FRAMEBUFFER_COMPLETE ?? 36053);
    const readPixelsSpy = vi.spyOn(state.gl, 'readPixels').mockImplementation(() => {});
    const out = new Uint8Array(16);
    const result = readGlRenderTargetPixels(state, target, 0, 0, 4, 4, out);
    expect(result).toBe(true);
    expect(readPixelsSpy).toHaveBeenCalled();
  });

  it('uses FLOAT type for Float32Array output', () => {
    const { state } = createGlState();
    const target = makeTarget({ format: 'rgba32f' });
    vi.spyOn(state.gl, 'checkFramebufferStatus').mockReturnValue(state.gl.FRAMEBUFFER_COMPLETE ?? 36053);
    const readPixelsSpy = vi.spyOn(state.gl, 'readPixels').mockImplementation(() => {});
    const out = new Float32Array(16);
    readGlRenderTargetPixels(state, target, 0, 0, 4, 4, out);
    const glConst = state.gl;
    expect(readPixelsSpy).toHaveBeenCalledWith(0, 0, 4, 4, expect.any(Number), glConst.FLOAT, out);
  });

  it('uses the resolveFramebuffer when present', () => {
    const { state } = createGlState();
    const resolveFbo = {} as WebGLFramebuffer;
    const drawFbo = {} as WebGLFramebuffer;
    const target = makeTarget({ framebuffer: drawFbo, resolveFramebuffer: resolveFbo });
    const bindSpy = vi.spyOn(state.gl, 'bindFramebuffer');
    vi.spyOn(state.gl, 'readPixels').mockImplementation(() => {});
    const out = new Uint8Array(16);
    readGlRenderTargetPixels(state, target, 0, 0, 1, 1, out);
    // Verify the resolve FBO (not the draw FBO) was bound for reading.
    const boundFbos = bindSpy.mock.calls.map((call) => call[1]);
    expect(boundFbos).toContain(resolveFbo);
    expect(boundFbos).not.toContain(drawFbo);
  });
});
