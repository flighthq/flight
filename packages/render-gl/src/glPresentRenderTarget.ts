import type { GlContext, GlFullscreenProgram, GlRenderState, GlRenderTarget } from '@flighthq/types/contract';

import { compileGlFullscreenProgram, drawGlFullscreenPass } from './glFullscreenPass';
import { drawGlLinearToSrgbPass } from './glLinearToSrgbPass';

// Presents `target` onto `dest` (the canvas when null): the generic, subject-agnostic final step that
// puts a finished render target on screen. It reads the target's DECLARED color space — 'linear' content
// (3D scene radiance) gets the single sRGB OETF encode; 'srgb' content (2D, already encoded) is copied
// straight through. Present is a property of the target, not of the scene or the display object, so both
// paths share this one function — there is deliberately no presentGlScene3D / presentGlNode2D split.
// Assumes MSAA is already resolved (endGlRenderPass does that); present only encodes or copies.
export function presentGlRenderTarget(
  state: GlRenderState,
  target: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget> | null = null,
): void {
  if (target.colorSpace === 'linear') {
    drawGlLinearToSrgbPass(state, target, dest);
    return;
  }
  drawGlFullscreenPass(state, getGlCopyProgram(state), [target.texture], dest, NOOP);
}

function getGlCopyProgram(state: GlRenderState): GlFullscreenProgram {
  let program = _programs.get(state.gl);
  if (program === undefined) {
    program = compileGlFullscreenProgram(state.gl, COPY_FRAGMENT_SRC);
    _programs.set(state.gl, program);
  }
  return program;
}

const NOOP = (): void => {};

// Per-context passthrough program for the 'srgb' present branch.
const _programs = new WeakMap<GlContext, GlFullscreenProgram>();

const COPY_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
out vec4 fragColor;
void main() {
  fragColor = texture(u_texture0, v_texCoord);
}`;
