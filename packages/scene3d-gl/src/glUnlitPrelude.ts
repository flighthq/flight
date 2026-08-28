import { resolveGlTexture } from '@flighthq/render-gl/contract';
import type {
  GlContext,
  GlUnlitDefineKey,
  GlUnlitProgram,
  LinearColor,
  GlRenderState,
  Texture,
} from '@flighthq/types/contract';

import { GL_MESH_FRAGMENT_TAIL, GL_MESH_FRAGMENT_TAIL_UNIFORMS } from './glMeshFragmentTail';
import {
  GL_SKIN_VERTEX_DECLARATIONS_GLSL,
  GL_UV_TRANSFORM_VERTEX_GLSL,
  compileGlProgram,
  ensureGlScene3DProgram,
} from './glMeshProgram';
import { getGlScene3DRuntime } from './glScene3DRuntime';

// Uploads the resolved unlit surface uniforms: the linear color
// (already sRgb-decoded on the CPU), the intensity scale (1 for Unlit/VertexColor, emissiveStrength
// for Emissive), the optional color map on texture unit 0, and the alpha-mask cutoff. The caller has
// already selected the program (beginGlMeshDraw) and set the view-projection.
export function bindGlUnlitSurface(
  state: GlRenderState,
  program: Readonly<GlUnlitProgram>,
  color: Readonly<LinearColor>,
  intensity: number,
  colorMap: Readonly<Texture> | null,
  alphaCutoff: number,
): void {
  const gl = state.gl;
  gl.uniform4f(program.locColor, color[0], color[1], color[2], color[3]);
  gl.uniform1f(program.locIntensity, intensity);
  gl.uniform1f(program.locAlphaCutoff, alphaCutoff);

  if (colorMap !== null) {
    gl.activeTexture(gl.TEXTURE0);
    if (resolveGlTexture(state, colorMap) !== null) gl.uniform1i(program.locColorMap, 0);
  }
}

// A short, stable, order-independent string identity for an unlit define key, used as the program-
// cache key. Two keys with the same flags produce the same string and so share a compiled program.
export function buildGlUnlitDefineKey(key: Readonly<GlUnlitDefineKey>): string {
  return `${key.alphaMaskEnabled ? 'm' : '-'}${key.hasColorMap ? 'c' : '-'}${key.vertexColor ? 'v' : '-'}${
    key.hasUvTransform ? 'u' : '-'
  }${key.hasSkin ? 'k' : '-'}`;
}

// Compiles the unlit shader for a define key, links it, and resolves its uniform locations. Pure GL
// work — no caching — used by ensureGlUnlitProgram.
export function compileGlUnlitProgram(gl: GlContext, key: Readonly<GlUnlitDefineKey>): GlUnlitProgram {
  const program = compileGlProgram(gl, getGlUnlitVertexSourceForKey(key), getGlUnlitFragmentSourceForKey(key));
  return {
    locAlphaCutoff: gl.getUniformLocation(program, 'u_alphaCutoff'),
    locColor: gl.getUniformLocation(program, 'u_color'),
    locColorMap: gl.getUniformLocation(program, 'u_colorMap'),
    locIntensity: gl.getUniformLocation(program, 'u_intensity'),
    locJointNormalTexture: gl.getUniformLocation(program, 'u_jointNormalTexture'),
    locJointTexture: gl.getUniformLocation(program, 'u_jointTexture'),
    locModel: gl.getUniformLocation(program, 'u_model'),
    locNormalMatrix: null,
    locViewProjection: gl.getUniformLocation(program, 'u_viewProjection'),
    program,
  };
}

// Resolves the unlit program for a define key, compiling and caching it on first use through the
// shared scene program cache under the `unlit:` family namespace.
export function ensureGlUnlitProgram(state: GlRenderState, key: Readonly<GlUnlitDefineKey>): GlUnlitProgram {
  // Fold the render-state skinned-run flag into the variant so a skinned draw of an otherwise-identical
  // material compiles + caches its own HAS_SKIN program, without the material renderer knowing.
  const fullKey: GlUnlitDefineKey = {
    ...key,
    hasSkin: getGlScene3DRuntime(state).activeSkinnedRun,
  };
  return ensureGlScene3DProgram(state, `unlit:${buildGlUnlitDefineKey(fullKey)}`, (gl) =>
    compileGlUnlitProgram(gl, fullKey),
  );
}

// The full fragment source for a define key (define block + body), ready to hand to the GL compiler.
export function getGlUnlitFragmentSourceForKey(key: Readonly<GlUnlitDefineKey>): string {
  return buildDefineSource(key) + UNLIT_FRAGMENT_BODY;
}

// The full vertex source for a define key (define block + body), ready to hand to the GL compiler.
export function getGlUnlitVertexSourceForKey(key: Readonly<GlUnlitDefineKey>): string {
  return buildDefineSource(key) + (key.hasSkin ? GL_SKIN_VERTEX_DECLARATIONS_GLSL : '') + UNLIT_VERTEX_BODY;
}

function buildDefineSource(key: Readonly<GlUnlitDefineKey>): string {
  let defines = '#version 300 es\n';
  if (key.alphaMaskEnabled) defines += '#define ALPHA_MASK\n';
  if (key.hasColorMap) defines += '#define HAS_COLOR_MAP\n';
  if (key.hasUvTransform) defines += '#define HAS_UV_TRANSFORM\n';
  if (key.vertexColor) defines += '#define VERTEX_COLOR\n';
  if (key.hasSkin) defines += '#define HAS_SKIN\n';
  return defines;
}

const UNLIT_VERTEX_BODY = `
layout(location = 0) in vec3 a_position;
layout(location = 3) in vec2 a_uv0;
#ifdef VERTEX_COLOR
layout(location = 4) in vec4 a_color0;
out vec4 v_color0;
#endif

uniform mat4 u_viewProjection;
uniform mat4 u_model;
${GL_UV_TRANSFORM_VERTEX_GLSL}
out vec2 v_uv0;

void main() {
  v_uv0 = applyUvTransform(a_uv0);
#ifdef VERTEX_COLOR
  v_color0 = a_color0;
#endif
#ifdef HAS_SKIN
  gl_Position = u_viewProjection * u_model * skinMatrix() * vec4(a_position, 1.0);
#else
  gl_Position = u_viewProjection * u_model * vec4(a_position, 1.0);
#endif
}
`;

const UNLIT_FRAGMENT_BODY = `
precision highp float;

in vec2 v_uv0;
#ifdef VERTEX_COLOR
in vec4 v_color0;
#endif

uniform vec4 u_color;
uniform float u_intensity;
#ifdef HAS_COLOR_MAP
uniform sampler2D u_colorMap;
#endif
#ifdef ALPHA_MASK
uniform float u_alphaCutoff;
#endif

${GL_MESH_FRAGMENT_TAIL_UNIFORMS}

out vec4 fragColor;

// Texture.colorSpace selects the GPU format, so sampled color is already linear here.
void main() {
  vec4 color = u_color;
#ifdef VERTEX_COLOR
  color *= v_color0;
#endif
#ifdef HAS_COLOR_MAP
  vec4 sampled = texture(u_colorMap, v_uv0);
  color.rgb *= sampled.rgb;
  color.a *= sampled.a;
#endif
#ifdef ALPHA_MASK
  if (color.a < u_alphaCutoff) discard;
  color.a = 1.0;
#endif
  fragColor = vec4(color.rgb * u_intensity, color.a);
${GL_MESH_FRAGMENT_TAIL}
}
`;
