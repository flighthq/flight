import type { GlRenderTarget } from '@flighthq/types';
import { BlendMode } from '@flighthq/types';

import { clearGlRenderTarget, compileGlFullscreenProgram, drawGlFullscreenPass } from './glFullscreenPass';
import { getGlRenderStateRuntime } from './glRenderState';
import { createGlState, makeGL } from './glTestHelper';

const FRAG_SRC = `#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
out vec4 fragColor;
void main() {
  fragColor = texture(u_texture, v_texCoord);
}`;

function makeTarget(framebuffer: WebGLFramebuffer, width = 32, height = 16): GlRenderTarget {
  return {
    width,
    height,
    format: 'rgba8',
    colorSpace: 'srgb',
    sampleCount: 1,
    framebuffer,
    resolveFramebuffer: null,
    textures: [],
    texture: {} as WebGLTexture,
    depthTexture: null,
    colorRenderbuffers: [],
    depthStencilRenderbuffer: null,
  };
}

describe('clearGlRenderTarget', () => {
  it('binds the target framebuffer and clears it', () => {
    const { state, gl } = createGlState();
    const fb = {} as WebGLFramebuffer;
    const target = makeTarget(fb);
    const bindSpy = vi.spyOn(gl, 'bindFramebuffer');
    const clearSpy = vi.spyOn(gl, 'clear');

    clearGlRenderTarget(state, target);

    expect(bindSpy).toHaveBeenCalledWith(gl.FRAMEBUFFER, fb);
    expect(clearSpy).toHaveBeenCalledWith(gl.COLOR_BUFFER_BIT);
  });

  it('sets the viewport and renderTargetViewport to the target size', () => {
    const { state, gl } = createGlState();
    const target = makeTarget({} as WebGLFramebuffer, 48, 24);
    const viewportSpy = vi.spyOn(gl, 'viewport');

    clearGlRenderTarget(state, target);

    expect(viewportSpy).toHaveBeenCalledWith(0, 0, 48, 24);
    expect(getGlRenderStateRuntime(state).renderTargetViewport).toEqual({ width: 48, height: 24 });
  });

  it('clears to fully transparent', () => {
    const { state, gl } = createGlState();
    const clearColorSpy = vi.spyOn(gl, 'clearColor');

    clearGlRenderTarget(state, makeTarget({} as WebGLFramebuffer));

    expect(clearColorSpy).toHaveBeenCalledWith(0, 0, 0, 0);
  });

  it('invalidates cached texture and blend-mode bindings', () => {
    const { state } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    runtime.currentTexture = {} as WebGLTexture;
    runtime.currentBlendMode = BlendMode.Add;

    clearGlRenderTarget(state, makeTarget({} as WebGLFramebuffer));

    expect(runtime.currentTexture).toBeNull();
    expect(runtime.currentBlendMode).toBeNull();
  });

  it('skips rebinding when the target framebuffer is already current', () => {
    const { state, gl } = createGlState();
    const fb = {} as WebGLFramebuffer;
    const runtime = getGlRenderStateRuntime(state);
    runtime.currentFramebuffer = fb;
    const bindSpy = vi.spyOn(gl, 'bindFramebuffer');

    clearGlRenderTarget(state, makeTarget(fb));

    expect(bindSpy).not.toHaveBeenCalled();
  });
});

describe('compileGlFullscreenProgram', () => {
  it('returns a program with position and texCoord attribute locations', () => {
    const gl = makeGL();
    const prog = compileGlFullscreenProgram(gl, FRAG_SRC);
    expect(prog.program).toBeDefined();
    expect(typeof prog.locPosition).toBe('number');
    expect(typeof prog.locTexCoord).toBe('number');
  });

  it('collects u_texture0 sampler uniform locations', () => {
    const gl = makeGL();
    const prog = compileGlFullscreenProgram(gl, FRAG_SRC);
    expect(prog.textures).toBeDefined();
  });

  it('throws when vertex shader compilation fails', () => {
    const gl = makeGL();
    (gl.getShaderParameter as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);
    expect(() => compileGlFullscreenProgram(gl, FRAG_SRC)).toThrow('shader compile error');
  });

  it('throws when program linking fails', () => {
    const gl = makeGL();
    (gl.getProgramParameter as ReturnType<typeof vi.fn>).mockReturnValue(false);
    expect(() => compileGlFullscreenProgram(gl, FRAG_SRC)).toThrow('program link error');
  });
});

describe('drawGlFullscreenPass', () => {
  it('binds the destination framebuffer and sets its viewport', () => {
    const { state, gl } = createGlState();
    const program = compileGlFullscreenProgram(gl, FRAG_SRC);
    const dest = makeTarget({} as WebGLFramebuffer, 40, 20);
    const bindSpy = vi.spyOn(gl, 'bindFramebuffer');
    const viewportSpy = vi.spyOn(gl, 'viewport');

    drawGlFullscreenPass(state, program, [], dest, () => {});

    expect(bindSpy).toHaveBeenCalledWith(gl.FRAMEBUFFER, dest.framebuffer);
    expect(viewportSpy).toHaveBeenCalledWith(0, 0, 40, 20);
    expect(getGlRenderStateRuntime(state).renderTargetViewport).toEqual({ width: 40, height: 20 });
  });

  it('targets the canvas and clears renderTargetViewport when dest is null', () => {
    const { state, gl, canvas } = createGlState();
    const program = compileGlFullscreenProgram(gl, FRAG_SRC);
    const viewportSpy = vi.spyOn(gl, 'viewport');

    drawGlFullscreenPass(state, program, [], null, () => {});

    expect(viewportSpy).toHaveBeenCalledWith(0, 0, canvas.width, canvas.height);
    expect(getGlRenderStateRuntime(state).renderTargetViewport).toBeNull();
  });

  it('binds each input texture to its sampler unit', () => {
    const { state, gl } = createGlState();
    const program = compileGlFullscreenProgram(gl, FRAG_SRC);
    const inputs = [{} as WebGLTexture, {} as WebGLTexture];
    const bindTextureSpy = vi.spyOn(gl, 'bindTexture');
    const activeTextureSpy = vi.spyOn(gl, 'activeTexture');

    drawGlFullscreenPass(state, program, inputs, null, () => {});

    expect(activeTextureSpy).toHaveBeenCalledWith(gl.TEXTURE0);
    expect(activeTextureSpy).toHaveBeenCalledWith(gl.TEXTURE0 + 1);
    expect(bindTextureSpy).toHaveBeenCalledWith(gl.TEXTURE_2D, inputs[0]);
    expect(bindTextureSpy).toHaveBeenCalledWith(gl.TEXTURE_2D, inputs[1]);
  });

  it('invokes the setUniforms callback before drawing', () => {
    const { state, gl } = createGlState();
    const program = compileGlFullscreenProgram(gl, FRAG_SRC);
    const drawSpy = vi.spyOn(gl, 'drawElements');
    const setUniforms = vi.fn(() => {
      expect(drawSpy).not.toHaveBeenCalled();
    });

    drawGlFullscreenPass(state, program, [], null, setUniforms);

    expect(setUniforms).toHaveBeenCalledWith(gl, program);
    expect(drawSpy).toHaveBeenCalled();
  });

  it('sets premultiplied-alpha blending and invalidates the cached blend mode', () => {
    const { state, gl } = createGlState();
    const program = compileGlFullscreenProgram(gl, FRAG_SRC);
    const blendSpy = vi.spyOn(gl, 'blendFunc');

    drawGlFullscreenPass(state, program, [], null, () => {});

    expect(blendSpy).toHaveBeenCalledWith(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    expect(getGlRenderStateRuntime(state).currentBlendMode).toBeNull();
  });
});
