import type { GlRenderState } from '@flighthq/types';

import type { GlMeshProgram } from './glMeshProgram';
import { compileGlProgram, ensureGlSceneProgram } from './glMeshProgram';

// The Gl wireframe prelude: a minimal GLSL 300 es shader that transforms the position attribute by
// the model + view-projection matrices and outputs a single flat LINE color. It has no lighting and
// no maps — the WireframeMaterial draws mesh edges as GL lines (see glWireframeUpload for the derived
// line-index buffer), so the fragment stage only needs the line color (decoded to linear on the CPU).
// There are no feature variants, so a single program is cached per state under the `wireframe:` key.

// A compiled wireframe program. Extends GlMeshProgram (model + view-projection; locNormalMatrix is
// null — wireframe has no normals) with the single line-color uniform.
export interface GlWireframeProgram extends GlMeshProgram {
  locColor: WebGLUniformLocation | null;
}

// Compiles the wireframe shader, links it, and resolves its uniform locations. Pure GL work — no
// caching — used by ensureGlWireframeProgram.
export function compileGlWireframeProgram(gl: WebGL2RenderingContext): GlWireframeProgram {
  const program = compileGlProgram(gl, getGlWireframeVertexSource(), getGlWireframeFragmentSource());
  return {
    locColor: gl.getUniformLocation(program, 'u_color'),
    locModel: gl.getUniformLocation(program, 'u_model'),
    locNormalMatrix: null,
    locViewProjection: gl.getUniformLocation(program, 'u_viewProjection'),
    program,
  };
}

// Resolves the wireframe program, compiling and caching it on first use through the shared scene
// program cache under the `wireframe:` family namespace.
export function ensureGlWireframeProgram(state: GlRenderState): GlWireframeProgram {
  return ensureGlSceneProgram(state, 'wireframe:', (gl) => compileGlWireframeProgram(gl));
}

// The wireframe fragment source: outputs the flat linear line color.
export function getGlWireframeFragmentSource(): string {
  return WIREFRAME_FRAGMENT;
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

const WIREFRAME_FRAGMENT = `#version 300 es
precision highp float;

uniform vec4 u_color;

out vec4 fragColor;

void main() {
  fragColor = u_color;
}
`;
