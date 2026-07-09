import { drawGlFullscreenPass } from '@flighthq/render-gl';
import type { CustomShaderEffect, GlRenderEffectRunner, GlRenderState, GlRenderTarget } from '@flighthq/types';

import { getGlEffectProgram, getGlEffectUniformLocation } from './glEffectProgramCache';

// Runs a user-authored fragment shader as a fullscreen post-process pass. The descriptor carries a
// `shaderKey` — a reference into the per-state custom-shader registry populated by
// registerGlCustomShaderSource — plus a flat `uniforms` bag. The referenced fragment source reads the
// input as `u_texture0` and writes `o_color`, matching the built-in effect shaders. If the key is
// unregistered the pass copies the input through unchanged, so a missing shader degrades to identity
// rather than a blank or a GL error.
export function applyCustomShaderEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<CustomShaderEffect>,
): void {
  const fragmentSource = getGlCustomShaderSource(state, effect.shaderKey);
  if (fragmentSource === null) {
    const passthrough = getGlEffectProgram(state, 'custom.passthrough', PASSTHROUGH_FRAGMENT_SRC);
    drawGlFullscreenPass(state, passthrough, [source.texture], dest, NO_UNIFORMS);
    return;
  }

  const program = getGlEffectProgram(state, 'custom.' + effect.shaderKey, fragmentSource);
  const uniforms = effect.uniforms;
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    if (uniforms === undefined) return;
    for (const name of Object.keys(uniforms)) {
      const location = getGlEffectUniformLocation(state, p, name);
      if (location === null) continue;
      const value = uniforms[name];
      if (typeof value === 'number') {
        gl.uniform1f(location, value);
        continue;
      }
      // Vector uniforms by component count; any other length uploads as a float array (float[]).
      // Matrix uniforms are intentionally out of scope for this dynamic path — a mat3/mat4 needs a
      // uniformMatrix upload, so author a dedicated effect for those rather than passing 9/16 floats.
      switch (value.length) {
        case 1:
          gl.uniform1f(location, value[0]);
          break;
        case 2:
          gl.uniform2fv(location, value);
          break;
        case 3:
          gl.uniform3fv(location, value);
          break;
        case 4:
          gl.uniform4fv(location, value);
          break;
        default:
          gl.uniform1fv(location, value);
          break;
      }
    }
  });
}

export const defaultGlCustomShaderEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyCustomShaderEffectToGl(ctx.state, ctx.source, ctx.dest, effect as CustomShaderEffect);
};

// Returns the fragment source registered under `shaderKey` for this state, or null when none is
// registered. Doubles as the introspection query for the identity-passthrough fallback in
// applyCustomShaderEffectToGl.
export function getGlCustomShaderSource(state: GlRenderState, shaderKey: string): string | null {
  return _customShaders.get(state)?.get(shaderKey) ?? null;
}

// Registers a fragment shader source under `shaderKey` for this state, so a CustomShaderEffect naming
// that key runs it. The source is a complete WebGL2 fragment shader: it declares `uniform sampler2D
// u_texture0;` for the input, reads texcoords from `in vec2 v_texCoord;`, writes `out vec4 o_color;`,
// and may declare any float/vec uniforms it wants supplied through the effect's `uniforms` bag.
// Last write wins for the source lookup, but the compiled program is cached by the shaderKey, so
// re-registering a *different* source under the same key keeps running the already-compiled program.
// Register edited source under a new key (and point the effect at it) to force a recompile.
export function registerGlCustomShaderSource(state: GlRenderState, shaderKey: string, fragmentSource: string): void {
  let registry = _customShaders.get(state);
  if (registry === undefined) {
    registry = new Map();
    _customShaders.set(state, registry);
  }
  registry.set(shaderKey, fragmentSource);
}

const NO_UNIFORMS = () => {};

const PASSTHROUGH_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
out vec4 o_color;
void main() {
  o_color = texture(u_texture0, v_texCoord);
}`;

const _customShaders = new WeakMap<GlRenderState, Map<string, string>>();
