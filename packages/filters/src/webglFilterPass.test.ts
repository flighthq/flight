import type { vi } from 'vitest';
import { describe, expect, it } from 'vitest';

import { makeFilterState as makeWebGLState, makeRenderTarget } from './filterTestHelper';
import { clearWebGLFilterTarget, compileWebGLFilterProgram, drawWebGLFilterPass } from './webglFilterPass';

describe('clearWebGLFilterTarget', () => {
  it('binds the target framebuffer and clears to transparent', () => {
    const { state, gl } = makeWebGLState();
    const target = makeRenderTarget();
    clearWebGLFilterTarget(state, target);
    expect(gl.bindFramebuffer).toHaveBeenCalledWith((gl as any).FRAMEBUFFER, target.framebuffer);
    expect(gl.clearColor).toHaveBeenCalledWith(0, 0, 0, 0);
    expect(gl.clear).toHaveBeenCalledWith((gl as any).COLOR_BUFFER_BIT);
  });

  it('skips bindFramebuffer when the target is already current', () => {
    const { state, gl } = makeWebGLState();
    const target = makeRenderTarget();
    (state as any).currentFramebuffer = target.framebuffer;
    clearWebGLFilterTarget(state, target);
    expect(gl.bindFramebuffer).not.toHaveBeenCalled();
  });

  it('resets currentTexture and currentBlendMode', () => {
    const { state } = makeWebGLState();
    (state as any).currentTexture = {};
    (state as any).currentBlendMode = 'normal';
    const target = makeRenderTarget();
    clearWebGLFilterTarget(state, target);
    expect(state.currentTexture).toBeNull();
    expect(state.currentBlendMode).toBeNull();
  });
});

describe('compileWebGLFilterProgram', () => {
  it('compiles vertex and fragment shaders and links a program', () => {
    const { gl } = makeWebGLState();
    const loc = compileWebGLFilterProgram(gl, '#version 300 es\nvoid main() {}');
    expect(gl.createShader).toHaveBeenCalledTimes(2);
    expect(gl.createProgram).toHaveBeenCalledTimes(1);
    expect(gl.linkProgram).toHaveBeenCalledTimes(1);
    expect(loc.program).toBeDefined();
    expect(typeof loc.locPosition).toBe('number');
    expect(typeof loc.locTexCoord).toBe('number');
    expect(loc.locTexture).toBeDefined();
  });

  it('deletes the shader objects after linking', () => {
    const { gl } = makeWebGLState();
    compileWebGLFilterProgram(gl, '#version 300 es\nvoid main() {}');
    expect(gl.deleteShader).toHaveBeenCalledTimes(2);
  });

  it('throws when program linking fails', () => {
    const { gl } = makeWebGLState();
    (gl.getProgramParameter as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);
    expect(() => compileWebGLFilterProgram(gl, '')).toThrow('Filter program link error');
  });

  it('throws when shader compilation fails', () => {
    const { gl } = makeWebGLState();
    (gl.getShaderParameter as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);
    expect(() => compileWebGLFilterProgram(gl, '')).toThrow('Filter shader compile error');
  });
});

describe('drawWebGLFilterPass', () => {
  it('calls drawElements once for a single pass', () => {
    const { state, gl } = makeWebGLState();
    const loc = compileWebGLFilterProgram(gl, '#version 300 es\nvoid main() {}');
    drawWebGLFilterPass(state, makeRenderTarget(), makeRenderTarget(), loc, () => {});
    expect(gl.drawElements).toHaveBeenCalledTimes(1);
  });

  it('passes the gl context to setUniforms', () => {
    const { state, gl } = makeWebGLState();
    const loc = compileWebGLFilterProgram(gl, '#version 300 es\nvoid main() {}');
    let captured: WebGL2RenderingContext | null = null;
    drawWebGLFilterPass(state, makeRenderTarget(), makeRenderTarget(), loc, (ctx) => {
      captured = ctx;
    });
    expect(captured).toBe(gl);
  });

  it('binds the destination framebuffer', () => {
    const { state, gl } = makeWebGLState();
    const loc = compileWebGLFilterProgram(gl, '#version 300 es\nvoid main() {}');
    const dest = makeRenderTarget();
    drawWebGLFilterPass(state, makeRenderTarget(), dest, loc, () => {});
    expect(gl.bindFramebuffer).toHaveBeenCalledWith((gl as any).FRAMEBUFFER, dest.framebuffer);
  });

  it('uses the source texture', () => {
    const { state, gl } = makeWebGLState();
    const loc = compileWebGLFilterProgram(gl, '#version 300 es\nvoid main() {}');
    const source = makeRenderTarget();
    drawWebGLFilterPass(state, source, makeRenderTarget(), loc, () => {});
    expect(gl.bindTexture).toHaveBeenCalledWith((gl as any).TEXTURE_2D, source.texture);
  });
});
