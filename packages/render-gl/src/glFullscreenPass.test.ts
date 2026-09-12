import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { GlRenderPass, GlRenderState, GlTextureRenderTarget } from '@flighthq/types/contract';

import {
  clearGlRenderTarget,
  clearGlRenderTargetAttachments,
  compileGlFullscreenProgram,
  drawGlFullscreenPass,
  fillGlRect,
} from './glFullscreenPass';
import { getGlRenderStateRuntime } from './glRenderState';
import { createGlState, makeGL } from './glTestHelper';

function makePass(state: GlRenderState): GlRenderPass {
  const pass = allocateEntity<GlRenderPass>();
  (pass as unknown as { gl: GlRenderState['gl'] }).gl = state.gl;
  (pass as unknown as { state: GlRenderState }).state = state;
  (pass as unknown as { target: null }).target = null as never;
  return finishEntity(pass);
}

const FRAG_SRC = `#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
out vec4 fragColor;
void main() {
  fragColor = texture(u_texture, v_texCoord);
}`;

function makeTarget(
  framebuffer: WebGLFramebuffer,
  width = 32,
  height = 16,
  gl?: WebGL2RenderingContext,
): GlTextureRenderTarget {
  const out = allocateEntity<GlTextureRenderTarget>();
  if (gl) (out as unknown as { gl: WebGL2RenderingContext }).gl = gl;
  out.requestedAxes = {
    width,
    height,
    format: 'rgba8',
    colorAttachments: 1,
    colorFormats: ['rgba8'],
    sampleCount: 1,
    depth: 'none',
    colorSpace: 'srgb',
  };
  out.width = width;
  out.height = height;
  out.format = 'rgba8';
  out.colorAttachments = 1;
  out.colorFormats = ['rgba8'];
  out.depth = 'none';
  out.colorSpace = 'srgb';
  out.sampleCount = 1;
  out.framebuffer = framebuffer;
  out.resolveFramebuffer = null;
  const texture = {} as WebGLTexture;
  out.textures = [texture];
  out.texture = texture;
  out.depthTexture = null;
  out.colorRenderbuffers = [];
  out.depthStencilRenderbuffer = null;
  return finishEntity(out);
}

describe('clearGlRenderTarget', () => {
  it('binds the target framebuffer and clears color via clearBufferfv', () => {
    const { gl } = createGlState();
    const fb = {} as WebGLFramebuffer;
    const target = makeTarget(fb, 32, 16, gl);
    const bindSpy = vi.spyOn(gl, 'bindFramebuffer');
    const clearSpy = vi.spyOn(gl, 'clearBufferfv');

    clearGlRenderTarget(target, { color: [0, 0, 0, 0] });

    expect(bindSpy).toHaveBeenCalledWith(gl.FRAMEBUFFER, fb);
    expect(clearSpy).toHaveBeenCalledWith(gl.COLOR, 0, expect.anything());
  });

  it('sets the viewport to the target size', () => {
    const { gl } = createGlState();
    const target = makeTarget({} as WebGLFramebuffer, 48, 24, gl);
    const viewportSpy = vi.spyOn(gl, 'viewport');

    clearGlRenderTarget(target, { color: [0, 0, 0, 0] });

    expect(viewportSpy).toHaveBeenCalledWith(0, 0, 48, 24);
  });

  it('writes float RGBA values directly to clearBufferfv', () => {
    const { gl } = createGlState();
    const clearSpy = vi.spyOn(gl, 'clearBufferfv');

    clearGlRenderTarget(makeTarget({} as WebGLFramebuffer, 32, 16, gl), { color: [1, 0, 0.5, 1] });

    const rgba = clearSpy.mock.calls[0][2] as Float32Array;
    expect(rgba[0]).toBeCloseTo(1);
    expect(rgba[1]).toBeCloseTo(0);
    expect(rgba[2]).toBeCloseTo(0.5);
    expect(rgba[3]).toBeCloseTo(1);
  });
});

describe('clearGlRenderTargetAttachments', () => {
  it('clears individual color attachments via clearBufferfv', () => {
    const { gl } = createGlState();
    const fb = {} as WebGLFramebuffer;
    const target = makeTarget(fb, 32, 16, gl);
    const clearSpy = vi.spyOn(gl, 'clearBufferfv');

    clearGlRenderTargetAttachments(target, {
      colors: [
        [1, 0, 0, 1],
        [0, 1, 0, 1],
      ],
    });

    expect(clearSpy).toHaveBeenCalledWith(gl.COLOR, 0, expect.anything());
    expect(clearSpy).toHaveBeenCalledWith(gl.COLOR, 1, expect.anything());
  });

  it('skips undefined entries in colors', () => {
    const { gl } = createGlState();
    const target = makeTarget({} as WebGLFramebuffer, 32, 16, gl);
    const clearSpy = vi.spyOn(gl, 'clearBufferfv');

    clearGlRenderTargetAttachments(target, {
      colors: [undefined, [0, 0, 1, 1]],
    });

    expect(clearSpy).toHaveBeenCalledTimes(1);
    expect(clearSpy).toHaveBeenCalledWith(gl.COLOR, 1, expect.anything());
  });

  it('disables scissor test during clear and restores it', () => {
    const { gl } = createGlState();
    const target = makeTarget({} as WebGLFramebuffer, 32, 16, gl);
    gl.enable(gl.SCISSOR_TEST);
    const disableSpy = vi.spyOn(gl, 'disable');
    const enableSpy = vi.spyOn(gl, 'enable');

    clearGlRenderTargetAttachments(target, { colors: [[0, 0, 0, 0]] });

    expect(disableSpy).toHaveBeenCalledWith(gl.SCISSOR_TEST);
    expect(enableSpy).toHaveBeenCalledWith(gl.SCISSOR_TEST);
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
  // The freeze this guards against: a fullscreen pass covers its whole destination, so the
  // destination's depth buffer is not its business — but nothing was turning depth off. Presenting a
  // 3D frame leaves GL_DEPTH_TEST enabled with GL_LESS and depth writes on, and the DEFAULT framebuffer
  // is the one surface nobody clears between frames. So frame one's quad passed, wrote its own depth,
  // and every frame after it was rejected at the same depth: the canvas kept frame one forever while
  // the scene behind it went on drawing correctly. Reading the state AT the draw is the whole point —
  // asserting it around the call would pass against the broken version.
  it('draws with the depth test and depth writes off', () => {
    const { state, gl } = createGlState();
    const program = compileGlFullscreenProgram(gl, FRAG_SRC);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    let depthTestAtDraw: boolean | null = null;
    let depthWriteAtDraw: unknown = null;
    vi.spyOn(gl, 'drawElements').mockImplementation(() => {
      depthTestAtDraw = gl.isEnabled(gl.DEPTH_TEST);
      depthWriteAtDraw = gl.getParameter(gl.DEPTH_WRITEMASK);
    });

    drawGlFullscreenPass(state, program, [], null, () => {});

    expect(depthTestAtDraw).toBe(false);
    expect(depthWriteAtDraw).toBe(false);
  });

  // Restoring matters because the pass is public and runs mid-frame: an effect chain chains several of
  // these between scene draws, and a 3D draw that resumed with depth silently off would z-fight itself.
  it('restores the caller depth state it turned off', () => {
    const { state, gl } = createGlState();
    const program = compileGlFullscreenProgram(gl, FRAG_SRC);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);

    drawGlFullscreenPass(state, program, [], null, () => {});

    expect(gl.isEnabled(gl.DEPTH_TEST)).toBe(true);
    expect(gl.getParameter(gl.DEPTH_WRITEMASK)).toBe(true);
  });

  it('leaves depth state alone when the caller already had it off', () => {
    const { state, gl } = createGlState();
    const program = compileGlFullscreenProgram(gl, FRAG_SRC);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);

    drawGlFullscreenPass(state, program, [], null, () => {});

    expect(gl.isEnabled(gl.DEPTH_TEST)).toBe(false);
    expect(gl.getParameter(gl.DEPTH_WRITEMASK)).toBe(false);
  });

  // The depth defect's surviving twin. `applyGlBlendMode` sets the equation and factors but never the
  // BLEND enable bit, which the pass inherited from whatever ran before — in practice from the single
  // `gl.enable(gl.BLEND)` in `createGlRenderState`. That is not a safe thing to inherit: `drawGlScene3D`
  // ends a blended subset pass with `gl.disable(gl.BLEND)` and never re-enables it, so a present or
  // effect pass following a 3D scene composited with blending silently off.
  it('draws with blending enabled even when the caller left it disabled', () => {
    const { state, gl } = createGlState();
    const program = compileGlFullscreenProgram(gl, FRAG_SRC);
    gl.disable(gl.BLEND);
    let blendAtDraw: boolean | null = null;
    vi.spyOn(gl, 'drawElements').mockImplementation(() => {
      blendAtDraw = gl.isEnabled(gl.BLEND);
    });

    drawGlFullscreenPass(state, program, [], null, () => {});

    expect(blendAtDraw).toBe(true);
  });

  it('restores a caller that had blending disabled', () => {
    const { state, gl } = createGlState();
    const program = compileGlFullscreenProgram(gl, FRAG_SRC);
    gl.disable(gl.BLEND);

    drawGlFullscreenPass(state, program, [], null, () => {});

    expect(gl.isEnabled(gl.BLEND)).toBe(false);
  });

  it('leaves blending enabled for a caller that already had it on', () => {
    const { state, gl } = createGlState();
    const program = compileGlFullscreenProgram(gl, FRAG_SRC);
    gl.enable(gl.BLEND);

    drawGlFullscreenPass(state, program, [], null, () => {});

    expect(gl.isEnabled(gl.BLEND)).toBe(true);
  });

  // The quad currently survives an inherited CULL_FACE only because it happens to be wound CCW and the
  // mesh path happens to restore FRONT_FACE to CCW after every draw. `glMeshProgram` says so in its own
  // comment — leaving CW set behind a mirrored mesh "culls that pass and the whole frame comes back
  // blank", which is a defect this repo has already had once. Owning the bit here retires that
  // cross-package invariant: no winding convention or inherited cull state can drop a fullscreen quad.
  it('draws with face culling off, whatever the caller left enabled', () => {
    const { state, gl } = createGlState();
    const program = compileGlFullscreenProgram(gl, FRAG_SRC);
    gl.enable(gl.CULL_FACE);
    let cullAtDraw: boolean | null = null;
    vi.spyOn(gl, 'drawElements').mockImplementation(() => {
      cullAtDraw = gl.isEnabled(gl.CULL_FACE);
    });

    drawGlFullscreenPass(state, program, [], null, () => {});

    expect(cullAtDraw).toBe(false);
  });

  it('restores a caller that had face culling enabled', () => {
    const { state, gl } = createGlState();
    const program = compileGlFullscreenProgram(gl, FRAG_SRC);
    gl.enable(gl.CULL_FACE);

    drawGlFullscreenPass(state, program, [], null, () => {});

    expect(gl.isEnabled(gl.CULL_FACE)).toBe(true);
  });

  it('leaves face culling off for a caller that already had it off', () => {
    const { state, gl } = createGlState();
    const program = compileGlFullscreenProgram(gl, FRAG_SRC);
    gl.disable(gl.CULL_FACE);

    drawGlFullscreenPass(state, program, [], null, () => {});

    expect(gl.isEnabled(gl.CULL_FACE)).toBe(false);
  });

  it('binds the destination framebuffer and sets its viewport', () => {
    const { state, gl } = createGlState();
    const program = compileGlFullscreenProgram(gl, FRAG_SRC);
    const dest = makeTarget({} as WebGLFramebuffer, 40, 20);
    const bindSpy = vi.spyOn(gl, 'bindFramebuffer');
    const viewportSpy = vi.spyOn(gl, 'viewport');

    drawGlFullscreenPass(state, program, [], dest, () => {});

    expect(bindSpy).toHaveBeenCalledWith(gl.FRAMEBUFFER, dest.framebuffer);
    expect(viewportSpy).toHaveBeenCalledWith(0, 0, 40, 20);
    expect(getGlRenderStateRuntime(state).renderTargetViewport).toEqual({ height: 20, width: 40, x: 0, y: 0 });
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

  it('sets premultiplied-alpha blending and caches the normal blend mode', () => {
    const { state, gl } = createGlState();
    const program = compileGlFullscreenProgram(gl, FRAG_SRC);
    const blendSpy = vi.spyOn(gl, 'blendFunc');
    const blendEquationSpy = vi.spyOn(gl, 'blendEquation');

    drawGlFullscreenPass(state, program, [], null, () => {});

    expect(blendSpy).toHaveBeenCalledWith(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    expect(blendEquationSpy).toHaveBeenCalledWith(gl.FUNC_ADD);
    expect(getGlRenderStateRuntime(state).context.currentBlendSignature).toEqual({
      dst: gl.ONE_MINUS_SRC_ALPHA,
      equation: gl.FUNC_ADD,
      src: gl.ONE,
    });
  });

  it('restores normal blending when setUniforms overrides the blend function', () => {
    const { state, gl } = createGlState();
    const program = compileGlFullscreenProgram(gl, FRAG_SRC);
    const blendSpy = vi.spyOn(gl, 'blendFunc');
    const blendEquationSpy = vi.spyOn(gl, 'blendEquation');

    drawGlFullscreenPass(state, program, [], null, (gl) => {
      gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
    });

    expect(blendSpy).toHaveBeenCalledWith(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
    expect(blendSpy).toHaveBeenLastCalledWith(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    expect(blendEquationSpy).toHaveBeenLastCalledWith(gl.FUNC_ADD);
    expect(getGlRenderStateRuntime(state).context.currentBlendSignature).toEqual({
      dst: gl.ONE_MINUS_SRC_ALPHA,
      equation: gl.FUNC_ADD,
      src: gl.ONE,
    });
  });
});

describe('fillGlRect', () => {
  it('unpacks a packed RGBA integer into float uniform values', () => {
    const { state, gl } = createGlState();
    const uniform4fSpy = vi.spyOn(gl, 'uniform4f');

    fillGlRect(makePass(state), 0xff8040ff);

    const call = uniform4fSpy.mock.calls.find((c) => typeof c[1] === 'number' && c[1] === 1);
    expect(call).toBeDefined();
    expect(call![2]).toBeCloseTo(0x80 / 255);
    expect(call![3]).toBeCloseTo(0x40 / 255);
    expect(call![4]).toBeCloseTo(1);
  });

  it('draws with blending enabled and depth test off', () => {
    const { state, gl } = createGlState();
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    let blendAtDraw: boolean | null = null;
    let depthAtDraw: boolean | null = null;
    vi.spyOn(gl, 'drawElements').mockImplementation(() => {
      blendAtDraw = gl.isEnabled(gl.BLEND);
      depthAtDraw = gl.isEnabled(gl.DEPTH_TEST);
    });

    fillGlRect(makePass(state), 0x000000ff);

    expect(blendAtDraw).toBe(true);
    expect(depthAtDraw).toBe(false);
  });

  it('restores depth and blend state after drawing', () => {
    const { state, gl } = createGlState();
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

    fillGlRect(makePass(state), 0x000000ff);

    expect(gl.isEnabled(gl.DEPTH_TEST)).toBe(true);
    expect(gl.isEnabled(gl.BLEND)).toBe(false);
  });

  it('enables scissor test when rect is provided', () => {
    const { state, gl } = createGlState();
    const scissorSpy = vi.spyOn(gl, 'scissor');

    fillGlRect(makePass(state), 0xff0000ff, { x: 10, y: 20, width: 30, height: 40 });

    expect(scissorSpy).toHaveBeenCalledWith(10, 20, 30, 40);
  });

  it('restores scissor state when rect is provided and scissor was off', () => {
    const { state, gl } = createGlState();
    gl.disable(gl.SCISSOR_TEST);

    fillGlRect(makePass(state), 0xff0000ff, { x: 0, y: 0, width: 10, height: 10 });

    expect(gl.isEnabled(gl.SCISSOR_TEST)).toBe(false);
  });
});
