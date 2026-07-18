import type { GlRenderTarget } from '@flighthq/types';

import { presentGlRenderTarget } from './glPresentRenderTarget';
import { createGlState } from './glTestHelper';

function makeTarget(colorSpace: 'linear' | 'srgb', texture: WebGLTexture): GlRenderTarget {
  return {
    width: 32,
    height: 16,
    format: colorSpace === 'linear' ? 'rgba16f' : 'rgba8',
    colorSpace,
    clearColors: [],
    clearDepth: 1,
    sampleCount: 1,
    framebuffer: {} as WebGLFramebuffer,
    resolveFramebuffer: null,
    textures: [texture],
    texture,
    depthTexture: null,
    colorRenderbuffers: [],
    depthStencilRenderbuffer: null,
  };
}

describe('presentGlRenderTarget', () => {
  it('encodes a linear target to sRGB and draws to the canvas when dest is null', () => {
    const { state, gl, canvas } = createGlState();
    const source = makeTarget('linear', { id: 'lin' } as unknown as WebGLTexture);
    const bindTexture = vi.spyOn(gl, 'bindTexture');
    const viewport = vi.spyOn(gl, 'viewport');
    const drawElements = vi.spyOn(gl, 'drawElements');

    presentGlRenderTarget(state, source);

    expect(bindTexture).toHaveBeenCalledWith(gl.TEXTURE_2D, source.texture);
    expect(viewport).toHaveBeenCalledWith(0, 0, canvas.width, canvas.height);
    expect(drawElements).toHaveBeenCalled();
  });

  it('copies an srgb target straight through (already encoded, no OETF pass)', () => {
    const { state, gl } = createGlState();
    const source = makeTarget('srgb', { id: 'srgb' } as unknown as WebGLTexture);
    const bindTexture = vi.spyOn(gl, 'bindTexture');
    const drawElements = vi.spyOn(gl, 'drawElements');

    presentGlRenderTarget(state, source);

    expect(bindTexture).toHaveBeenCalledWith(gl.TEXTURE_2D, source.texture);
    expect(drawElements).toHaveBeenCalled();
  });

  it('presents into dest when a target is given', () => {
    const { state, gl } = createGlState();
    const source = makeTarget('srgb', { id: 'srgb' } as unknown as WebGLTexture);
    const dest = makeTarget('srgb', { id: 'dst' } as unknown as WebGLTexture);
    const bindFramebuffer = vi.spyOn(gl, 'bindFramebuffer');

    presentGlRenderTarget(state, source, dest);

    expect(bindFramebuffer).toHaveBeenCalledWith(gl.FRAMEBUFFER, dest.framebuffer);
  });
});
