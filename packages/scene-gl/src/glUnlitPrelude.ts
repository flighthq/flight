import type { LinearColor } from '@flighthq/color';
import { hasImageResourcePixels } from '@flighthq/image';
import { bindGlImageResourceTexture } from '@flighthq/render-gl';
import type { GlRenderState, Texture } from '@flighthq/types';

import type { GlMeshProgram } from './glMeshProgram';
import {
  GL_SKIN_VERTEX_DECLARATIONS_GLSL,
  GL_UV_TRANSFORM_VERTEX_GLSL,
  compileGlProgram,
  ensureGlSceneProgram,
} from './glMeshProgram';
import { getGlSceneRuntime } from './glSceneRuntime';

// The shared Gl unlit prelude: the GLSL 300 es vertex + fragment shader for every lighting-
// independent flat-color material (Unlit, Emissive, VertexColor). All three output LINEAR color with
// no lighting term — Unlit/VertexColor at unit intensity, Emissive scaled by emissiveStrength (values
// > 1 drive bloom over the rgba16f scene target). One source string is specialized per material at
// compile time by a define block (see GlUnlitDefineKey), so the color-map / alpha-mask / vertex-color
// variants are #ifdef branches of one shader, never separate files. The CPU side passes the surface
// color already decoded to linear (unpackColorToLinear), so the shader never decodes a packed color;
// it only sRgb-decodes a sampled color-map texel.

// The feature flags that select an unlit variant. `vertexColor` reads the mesh's color0 attribute and
// multiplies it in (the VertexColor material); `hasColorMap` enables the sampled base/emissive map;
// `alphaMaskEnabled` enables the alpha-cutoff discard for 'mask' materials.
export interface GlUnlitDefineKey {
  alphaMaskEnabled: boolean;
  hasColorMap: boolean;
  // Whether this variant deforms the vertex by a bone palette (HAS_SKIN). Set by ensureGlUnlitProgram
  // from the render-state skinned-run flag, not the material renderer — skinning keys off geometry.
  hasSkin?: boolean;
  // Whether the color map carries a non-identity uv transform (HAS_UV_TRANSFORM). Set only when
  // hasColorMap is also true, since the transform applies to the sampled map's coordinates.
  hasUvTransform: boolean;
  vertexColor: boolean;
}

// A compiled unlit variant plus its resolved uniform locations. Extends GlMeshProgram with the unlit
// fragment uniforms; `locNormalMatrix` is null (unlit has no normals). One exists per distinct
// GlUnlitDefineKey, cached on the GlRenderState under the `unlit:` program-cache namespace.
export interface GlUnlitProgram extends GlMeshProgram {
  locAlphaCutoff: WebGLUniformLocation | null;
  locColor: WebGLUniformLocation | null;
  locColorMap: WebGLUniformLocation | null;
  locIntensity: WebGLUniformLocation | null;
}

// Uploads the resolved unlit surface uniforms shared by all three unlit materials: the linear color
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

  if (colorMap !== null && colorMap.image !== null && hasImageResourcePixels(colorMap.image)) {
    gl.activeTexture(gl.TEXTURE0);
    bindGlImageResourceTexture(state, colorMap.image, colorMap.sampler);
    gl.uniform1i(program.locColorMap, 0);
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
export function compileGlUnlitProgram(gl: WebGL2RenderingContext, key: Readonly<GlUnlitDefineKey>): GlUnlitProgram {
  const program = compileGlProgram(gl, getGlUnlitVertexSourceForKey(key), getGlUnlitFragmentSourceForKey(key));
  return {
    locAlphaCutoff: gl.getUniformLocation(program, 'u_alphaCutoff'),
    locColor: gl.getUniformLocation(program, 'u_color'),
    locColorMap: gl.getUniformLocation(program, 'u_colorMap'),
    locIntensity: gl.getUniformLocation(program, 'u_intensity'),
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
    hasSkin: getGlSceneRuntime(state).activeSkinnedRun,
  };
  return ensureGlSceneProgram(state, `unlit:${buildGlUnlitDefineKey(fullKey)}`, (gl) =>
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

uniform float u_objectAlpha;

out vec4 fragColor;

// sRgb texels are gamma-encoded; decode to linear before use. u_color is already linear (decoded on
// the CPU at bind), so only the sampled color-map needs decoding.
vec3 srgbToLinear(vec3 c) {
  vec3 lo = c / 12.92;
  vec3 hi = pow((c + 0.055) / 1.055, vec3(2.4));
  return mix(lo, hi, step(0.04045, c));
}

void main() {
  vec4 color = u_color;
#ifdef VERTEX_COLOR
  color *= v_color0;
#endif
#ifdef HAS_COLOR_MAP
  vec4 sampled = texture(u_colorMap, v_uv0);
  color.rgb *= srgbToLinear(sampled.rgb);
  color.a *= sampled.a;
#endif
#ifdef ALPHA_MASK
  if (color.a < u_alphaCutoff) discard;
#endif
  fragColor = vec4(color.rgb * u_intensity, color.a);
  fragColor.a *= u_objectAlpha;
}
`;
