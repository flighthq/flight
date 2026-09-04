import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { GlRenderTarget } from '@flighthq/types/contract';

import { presentGlRenderTarget } from './glPresentRenderTarget';
import { createGlState } from './glTestHelper';

function makeTarget(colorSpace: 'linear' | 'srgb', texture: WebGLTexture): GlRenderTarget {
  const format = colorSpace === 'linear' ? 'rgba16f' : 'rgba8';
  const out = allocateEntity<GlRenderTarget>();
  out.requestedAxes = {
    width: 32,
    height: 16,
    format,
    colorAttachments: 1,
    colorFormats: [format],
    sampleCount: 1,
    depth: 'none',
    colorSpace,
  };
  out.width = 32;
  out.height = 16;
  out.format = format;
  out.colorAttachments = 1;
  out.colorFormats = [format];
  out.depth = 'none';
  out.colorSpace = colorSpace;
  out.clearColors = [];
  out.clearDepth = 1;
  out.sampleCount = 1;
  out.framebuffer = {} as WebGLFramebuffer;
  out.resolveFramebuffer = null;
  out.textures = [texture];
  out.texture = texture;
  out.depthTexture = null;
  out.colorRenderbuffers = [];
  out.depthStencilRenderbuffer = null;
  return finishEntity(out);
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
