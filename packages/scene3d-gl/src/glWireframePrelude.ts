import type { GlWireframeProgram, GlRenderState } from '@flighthq/types/contract';

import { GL_MESH_FRAGMENT_TAIL } from './glMeshFragmentTail';
import { compileGlProgram, ensureGlScene3DProgram } from './glMeshProgram';

// The Gl wireframe prelude: a minimal GLSL 300 es shader that transforms the position attribute by
// the model + view-projection matrices and outputs a single flat LINE color. It has no lighting and
// no maps — the WireframeMaterial draws mesh edges as GL lines (see glWireframeUpload for the derived
// line-index buffer), so the fragment scene2d only needs the line color (decoded to linear on the CPU).
// Base and alpha-mask variants cache separately under the `wireframe:` key. Compiles the wireframe
// shader, links it, and resolves its uniform locations. Pure GL work — no caching — used by
// ensureGlWireframeProgram.
export function compileGlWireframeProgram(gl: WebGL2RenderingContext, alphaMaskEnabled = false): GlWireframeProgram {
  const program = compileGlProgram(gl, getGlWireframeVertexSource(), getGlWireframeFragmentSource(alphaMaskEnabled));
  return {
    locAlphaCutoff: gl.getUniformLocation(program, 'u_alphaCutoff'),
    locColor: gl.getUniformLocation(program, 'u_color'),
    locModel: gl.getUniformLocation(program, 'u_model'),
    locNormalMatrix: null,
    locViewProjection: gl.getUniformLocation(program, 'u_viewProjection'),
    program,
  };
}

// Resolves the wireframe program, compiling and caching it on first use through the shared scene
// program cache under the `wireframe:` family namespace.
export function ensureGlWireframeProgram(state: GlRenderState, alphaMaskEnabled = false): GlWireframeProgram {
  return ensureGlScene3DProgram(state, `wireframe:${alphaMaskEnabled ? 'mask' : 'base'}`, (gl) =>
    compileGlWireframeProgram(gl, alphaMaskEnabled),
  );
}

// The wireframe fragment source: outputs the flat linear line color.
export function getGlWireframeFragmentSource(alphaMaskEnabled = false): string {
  return `#version 300 es\n${alphaMaskEnabled ? '#define ALPHA_MASK\n' : ''}${WIREFRAME_FRAGMENT}`;
}

// The wireframe vertex source: position → clip space.
export function getGlWireframeVertexSource(): string {
  return WIREFRAME_VERTEX;
}

const WIREFRAME_VERTEX = `#version 300 es
layout(location = 0) in vec3 a_position;

uniform mat4 u_viewProjection;
uniform mat4 u_model;

void main() {
  gl_Position = u_viewProjection * u_model * vec4(a_position, 1.0);
}
`;

const WIREFRAME_FRAGMENT = `precision highp float;

uniform vec4 u_color;

#ifdef ALPHA_MASK
uniform float u_alphaCutoff;
#endif

uniform float u_objectAlpha;

out vec4 fragColor;

void main() {
  fragColor = u_color;
#ifdef ALPHA_MASK
  if (fragColor.a < u_alphaCutoff) discard;
#endif
${GL_MESH_FRAGMENT_TAIL}
}
`;
