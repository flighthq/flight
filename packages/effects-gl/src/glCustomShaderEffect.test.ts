import type { GlRenderState } from '@flighthq/types';

import {
  applyCustomShaderEffectToGl,
  defaultGlCustomShaderEffectRunner,
  getGlCustomShaderSource,
  registerGlCustomShaderSource,
} from './glCustomShaderEffect';

// The source registry is a plain WeakMap keyed by the render state, with no GL calls, so a bare
// object stands in for a state. The compile/draw path is exercised by the functional render suite.
function makeState(): GlRenderState {
  return {} as GlRenderState;
}

const FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
out vec4 o_color;
void main() { o_color = texture(u_texture0, v_texCoord); }`;

describe('applyCustomShaderEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyCustomShaderEffectToGl).toBe('function');
  });
});

describe('defaultGlCustomShaderEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlCustomShaderEffectRunner).toBe('function');
  });
});

describe('getGlCustomShaderSource', () => {
  it('returns null when no source is registered for the key', () => {
    expect(getGlCustomShaderSource(makeState(), 'missing')).toBeNull();
  });

  it('returns the source registered under the key', () => {
    const state = makeState();
    registerGlCustomShaderSource(state, 'ripple', FRAGMENT_SRC);
    expect(getGlCustomShaderSource(state, 'ripple')).toBe(FRAGMENT_SRC);
  });

  it('isolates sources per render state', () => {
    const a = makeState();
    const b = makeState();
    registerGlCustomShaderSource(a, 'ripple', FRAGMENT_SRC);
    expect(getGlCustomShaderSource(b, 'ripple')).toBeNull();
  });
});

describe('registerGlCustomShaderSource', () => {
  it('registers a source that getGlCustomShaderSource then resolves', () => {
    const state = makeState();
    registerGlCustomShaderSource(state, 'ripple', FRAGMENT_SRC);
    expect(getGlCustomShaderSource(state, 'ripple')).toBe(FRAGMENT_SRC);
  });

  it('is last-write-wins for a given key', () => {
    const state = makeState();
    const replacement = FRAGMENT_SRC.replace('texture(u_texture0, v_texCoord)', 'vec4(1.0)');
    registerGlCustomShaderSource(state, 'ripple', FRAGMENT_SRC);
    registerGlCustomShaderSource(state, 'ripple', replacement);
    expect(getGlCustomShaderSource(state, 'ripple')).toBe(replacement);
  });
});
