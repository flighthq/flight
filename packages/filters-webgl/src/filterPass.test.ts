import {
  clearWebGLFilterTarget,
  compileWebGLFilterProgram,
  drawWebGLDualSourcePass,
  drawWebGLFilterPass,
} from './filterPass';
import { makeFilterState, makeRenderTarget } from './testHelper';

const PASSTHROUGH_FRAG = `#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
out vec4 fragColor;
void main() { fragColor = texture(u_texture, v_texCoord); }`;

const DUAL_FRAG = `#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform sampler2D u_texture2;
out vec4 fragColor;
void main() { fragColor = texture(u_texture, v_texCoord); }`;

describe('clearWebGLFilterTarget', () => {
  it('clears without throwing', () => {
    const { state } = makeFilterState();
    expect(() => clearWebGLFilterTarget(state, makeRenderTarget())).not.toThrow();
  });
});

describe('compileWebGLFilterProgram', () => {
  it('returns locations with position and texCoord attributes', () => {
    const { gl } = makeFilterState();
    const loc = compileWebGLFilterProgram(gl, PASSTHROUGH_FRAG);
    expect(loc).toBeDefined();
    expect(typeof loc.locPosition).toBe('number');
    expect(typeof loc.locTexCoord).toBe('number');
  });
});

describe('drawWebGLDualSourcePass', () => {
  it('draws without throwing', () => {
    const { state, gl } = makeFilterState();
    const source0 = makeRenderTarget();
    const source1 = makeRenderTarget();
    const dest = makeRenderTarget();
    const base = compileWebGLFilterProgram(gl, DUAL_FRAG);
    const loc = { ...base, locTexture2: gl.getUniformLocation(base.program, 'u_texture2')! };
    expect(() => drawWebGLDualSourcePass(state, source0, source1, dest, loc, () => {})).not.toThrow();
  });
});

describe('drawWebGLFilterPass', () => {
  it('draws without throwing', () => {
    const { state, gl } = makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    const loc = compileWebGLFilterProgram(gl, PASSTHROUGH_FRAG);
    expect(() => drawWebGLFilterPass(state, source, dest, loc, () => {})).not.toThrow();
  });

  it('accepts null dest for default framebuffer', () => {
    const { state, gl } = makeFilterState();
    const source = makeRenderTarget();
    const loc = compileWebGLFilterProgram(gl, PASSTHROUGH_FRAG);
    expect(() => drawWebGLFilterPass(state, source, null, loc, () => {})).not.toThrow();
  });
});
