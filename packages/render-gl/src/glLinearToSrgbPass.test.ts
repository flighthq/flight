import type { GlRenderTarget } from '@flighthq/types';

import { drawGlLinearToSrgbPass, LINEAR_TO_SRGB_FRAGMENT_SRC } from './glLinearToSrgbPass';
import { createGlState } from './glTestHelper';

function makeTarget(framebuffer: WebGLFramebuffer, texture: WebGLTexture, width = 32, height = 16): GlRenderTarget {
  return {
    width,
    height,
    format: 'rgba16f',
    colorSpace: 'linear',
    sampleCount: 1,
    framebuffer,
    resolveFramebuffer: null,
    textures: [],
    texture,
    depthTexture: null,
    colorRenderbuffers: [],
    depthStencilRenderbuffer: null,
  };
}

describe('drawGlLinearToSrgbPass', () => {
  it('binds the source texture and draws to the canvas when dest is null', () => {
    const { state, gl, canvas } = createGlState();
    const source = makeTarget({} as WebGLFramebuffer, { id: 'src' } as unknown as WebGLTexture);
    const bindTexture = vi.spyOn(gl, 'bindTexture');
    const viewport = vi.spyOn(gl, 'viewport');
    const drawElements = vi.spyOn(gl, 'drawElements');

    drawGlLinearToSrgbPass(state, source, null);

    expect(bindTexture).toHaveBeenCalledWith(gl.TEXTURE_2D, source.texture);
    // dest === null presents to the canvas, so the viewport covers the full canvas.
    expect(viewport).toHaveBeenCalledWith(0, 0, canvas.width, canvas.height);
    expect(drawElements).toHaveBeenCalled();
  });

  it('presents into dest when a target is given', () => {
    const { state, gl } = createGlState();
    const source = makeTarget({} as WebGLFramebuffer, { id: 'src' } as unknown as WebGLTexture);
    const dest = makeTarget({ id: 'destFb' } as unknown as WebGLFramebuffer, { id: 'dst' } as unknown as WebGLTexture);
    const bindFramebuffer = vi.spyOn(gl, 'bindFramebuffer');

    drawGlLinearToSrgbPass(state, source, dest);

    expect(bindFramebuffer).toHaveBeenCalledWith(gl.FRAMEBUFFER, dest.framebuffer);
  });

  it('compiles its program once per state and reuses it across frames', () => {
    const { state, gl } = createGlState();
    const source = makeTarget({} as WebGLFramebuffer, {} as WebGLTexture);
    const createProgram = vi.spyOn(gl, 'createProgram');

    drawGlLinearToSrgbPass(state, source, null);
    drawGlLinearToSrgbPass(state, source, null);
    drawGlLinearToSrgbPass(state, source, null);

    expect(createProgram).toHaveBeenCalledTimes(1);
  });

  it('encodes the exact IEC 61966-2-1 sRGB OETF constants (parity with color.linearChannelToSrgb)', () => {
    // Guards against the shader drifting from @flighthq/color's canonical transfer, which cannot be
    // executed here (jsdom does not compile GLSL). The constants are the piecewise sRGB OETF.
    expect(LINEAR_TO_SRGB_FRAGMENT_SRC).toContain('0.0031308');
    expect(LINEAR_TO_SRGB_FRAGMENT_SRC).toContain('12.92');
    expect(LINEAR_TO_SRGB_FRAGMENT_SRC).toContain('1.055');
    expect(LINEAR_TO_SRGB_FRAGMENT_SRC).toContain('1.0 / 2.4');
    expect(LINEAR_TO_SRGB_FRAGMENT_SRC).toContain('0.055');
    // Alpha must pass through unencoded — it is linear coverage, not a color channel.
    expect(LINEAR_TO_SRGB_FRAGMENT_SRC).toContain('linear.a');
  });
});
