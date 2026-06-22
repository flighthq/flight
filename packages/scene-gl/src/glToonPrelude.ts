import type { GlRenderState } from '@flighthq/types';

import type { GlLitProgram } from './glLitProgram';
import { GL_MESH_LIGHT_BLOCK_GLSL, resolveGlLitLocations } from './glLitProgram';
import { ensureGlSceneProgram, linkGlProgram } from './glMeshProgram';

// The shared Gl Toon (cel-shading) prelude: the GLSL 300 es vertex + fragment shader for the Toon
// forward-lit path. One source string is specialized per material at compile time by a leading
// define block (see GlToonDefineKey / buildGlToonDefineSource), so the base-color-map / ramp /
// alpha-mask variants are #ifdef branches of one shader, never separate files.
//
// The cel model is deliberately simple: compute the diffuse N·L from the single directional light
// (read from the std140 light block included via GL_MESH_LIGHT_BLOCK_GLSL), then QUANTIZE that term
// into stepped bands — either by sampling a 1D `ramp` texture at vec2(nDotL, 0.5) (HAS_RAMP) or by
// flooring nDotL into u_steps even bands. The banded term modulates the linear base color (decoded
// to linear on the CPU at bind, optionally tinted by an sRgb-decoded base-color map) and the
// directional radiance; the ambient term is added flat. The fragment stage writes LINEAR color to
// fragColor (no tonemap / gamma here — the effect pipeline's resolve pass owns that), matching the
// rgba16f scene target.
//
// The light block layout mirrors SceneLightBlock.data exactly (std140): a directional term
// { direction.xyz, _pad, radiance.rgb, _pad } at offset 0 then an ambient term { radiance.rgb,
// _pad } — radiance is already linear and premultiplied by intensity at pack time, so the shader
// never decodes sRgb for lights. u_directionalCount / u_ambientCount (0 or 1) gate each term.

// The feature flags that select a Toon uber-shader variant. Each toggles an #ifdef in the prelude
// and is hashed into the program-cache key (buildGlToonDefineKey), so distinct flag sets compile and
// cache as distinct programs. `hasBaseColorMap` enables the sampled albedo tint; `hasRamp` switches
// the quantizer from stepped floor to a 1D ramp lookup; `alphaMaskEnabled` enables the alpha-cutoff
// discard for 'mask' materials.
export interface GlToonDefineKey {
  alphaMaskEnabled: boolean;
  hasBaseColorMap: boolean;
  hasRamp: boolean;
}

// A compiled Toon uber-shader variant plus its resolved uniform locations. One exists per distinct
// GlToonDefineKey, cached on the GlRenderState under the `toon:` program-cache namespace. Extends
// GlLitProgram (model/normal/view-projection + the standard light/camera uniforms) with the Toon
// material uniforms. Vertex attribute locations are fixed by the shader's `layout(location = …)`
// qualifiers (0 position, 1 normal, 3 uv0), so they are not stored here.
export interface GlToonProgram extends GlLitProgram {
  locAlphaCutoff: WebGLUniformLocation | null;
  locBaseColor: WebGLUniformLocation | null;
  locBaseColorMap: WebGLUniformLocation | null;
  locRamp: WebGLUniformLocation | null;
  locSteps: WebGLUniformLocation | null;
}

// A short, stable, order-independent string identity for a Toon define key, used as the program-
// cache key. Two keys with the same flags produce the same string and so share a compiled program.
export function buildGlToonDefineKey(key: Readonly<GlToonDefineKey>): string {
  return `${key.alphaMaskEnabled ? 'm' : '-'}${key.hasBaseColorMap ? 'b' : '-'}${key.hasRamp ? 'r' : '-'}`;
}

// Compiles the Toon uber-shader for a define key, links it, and resolves its uniform locations.
// Spreads the standard lit locations (resolveGlLitLocations) then adds the Toon material uniforms
// plus the shared model/normal/view-projection vertex transforms. Pure GL work — no caching — used
// by ensureGlToonProgram. Throws on a compile/link failure, which is a programmer error (a malformed
// prelude), not an expected runtime condition.
export function compileGlToonProgram(gl: WebGL2RenderingContext, key: Readonly<GlToonDefineKey>): GlToonProgram {
  const program = linkGlProgram(gl, getGlToonVertexSourceForKey(key), getGlToonFragmentSourceForKey(key));
  return {
    ...resolveGlLitLocations(gl, program),
    program,
    locAlphaCutoff: gl.getUniformLocation(program, 'u_alphaCutoff'),
    locBaseColor: gl.getUniformLocation(program, 'u_baseColor'),
    locBaseColorMap: gl.getUniformLocation(program, 'u_baseColorMap'),
    locModel: gl.getUniformLocation(program, 'u_model'),
    locNormalMatrix: gl.getUniformLocation(program, 'u_normalMatrix'),
    locRamp: gl.getUniformLocation(program, 'u_ramp'),
    locSteps: gl.getUniformLocation(program, 'u_steps'),
    locViewProjection: gl.getUniformLocation(program, 'u_viewProjection'),
  };
}

// Resolves the Toon program for a define key, compiling and caching it on first use through the
// shared scene program cache under the `toon:` family namespace, so each variant is compiled at most
// once per state and reused every frame.
export function ensureGlToonProgram(state: GlRenderState, key: Readonly<GlToonDefineKey>): GlToonProgram {
  return ensureGlSceneProgram(state, `toon:${buildGlToonDefineKey(key)}`, (gl) => compileGlToonProgram(gl, key));
}

// The full fragment source for a define key (define block + body), ready to hand to the GL compiler.
export function getGlToonFragmentSourceForKey(key: Readonly<GlToonDefineKey>): string {
  return buildGlToonDefineSource(key) + TOON_FRAGMENT_BODY;
}

// The full vertex source for a define key (define block + body), ready to hand to the GL compiler.
export function getGlToonVertexSourceForKey(key: Readonly<GlToonDefineKey>): string {
  return buildGlToonDefineSource(key) + TOON_VERTEX_BODY;
}

// Builds the leading "#version 300 es\n#define ..." block for a define key, to be prepended to the
// vertex and fragment prelude bodies before compile. Pure string assembly; the same key always
// yields the same source, which is what makes the program cache by define key sound.
function buildGlToonDefineSource(key: Readonly<GlToonDefineKey>): string {
  let defines = '#version 300 es\n';
  if (key.alphaMaskEnabled) defines += '#define ALPHA_MASK\n';
  if (key.hasBaseColorMap) defines += '#define HAS_BASE_COLOR_MAP\n';
  if (key.hasRamp) defines += '#define HAS_RAMP\n';
  return defines;
}

const TOON_VERTEX_BODY = `
layout(location = 0) in vec3 a_position;
layout(location = 1) in vec3 a_normal;
layout(location = 3) in vec2 a_uv0;

uniform mat4 u_viewProjection;
uniform mat4 u_model;
uniform mat3 u_normalMatrix;

out vec3 v_worldPosition;
out vec3 v_normal;
out vec2 v_uv0;

void main() {
  vec4 worldPosition = u_model * vec4(a_position, 1.0);
  v_worldPosition = worldPosition.xyz;
  v_normal = u_normalMatrix * a_normal;
  v_uv0 = a_uv0;
  gl_Position = u_viewProjection * worldPosition;
}
`;

const TOON_FRAGMENT_BODY = `
precision highp float;

in vec3 v_worldPosition;
in vec3 v_normal;
in vec2 v_uv0;

uniform vec4 u_baseColor;   // already linear (decoded on the CPU at bind)
uniform float u_steps;      // band count for the stepped floor quantizer (no ramp)
uniform float u_alphaCutoff;
${GL_MESH_LIGHT_BLOCK_GLSL}
#ifdef HAS_BASE_COLOR_MAP
uniform sampler2D u_baseColorMap;
#endif
#ifdef HAS_RAMP
uniform sampler2D u_ramp;
#endif

out vec4 fragColor;

// sRgb albedo texels are gamma-encoded; decode to linear before lighting. u_baseColor is already
// linear (decoded on the CPU at bind), so only sampled textures need decoding.
vec3 srgbToLinear(vec3 c) {
  vec3 lo = c / 12.92;
  vec3 hi = pow((c + 0.055) / 1.055, vec3(2.4));
  return mix(lo, hi, step(0.04045, c));
}

void main() {
  vec4 baseColor = u_baseColor;
#ifdef HAS_BASE_COLOR_MAP
  vec4 sampled = texture(u_baseColorMap, v_uv0);
  baseColor.rgb *= srgbToLinear(sampled.rgb);
  baseColor.a *= sampled.a;
#endif

#ifdef ALPHA_MASK
  if (baseColor.a < u_alphaCutoff) discard;
#endif

  vec3 normal = normalize(v_normal);
  if (!gl_FrontFacing) normal = -normal;

  vec3 radiance = vec3(0.0);

  // Directional light: -direction is the surface-to-light vector (light travels along direction).
  // The raw N·L is quantized into cel bands — via a 1D ramp lookup or a stepped floor — then scales
  // the base color and the directional radiance.
  if (u_directionalCount > 0.5) {
    vec3 lightDir = normalize(-u_directional.xyz);
    float nDotL = clamp(dot(normal, lightDir), 0.0, 1.0);
#ifdef HAS_RAMP
    vec3 band = texture(u_ramp, vec2(nDotL, 0.5)).rgb;
    radiance += baseColor.rgb * band * u_directionalRadiance.rgb;
#else
    float band = floor(nDotL * u_steps) / max(u_steps, 1.0);
    radiance += baseColor.rgb * band * u_directionalRadiance.rgb;
#endif
  }

  // Ambient term: flat irradiance over the base color (unbanded).
  if (u_ambientCount > 0.5) {
    radiance += baseColor.rgb * u_ambientRadiance;
  }

  fragColor = vec4(radiance, baseColor.a);
}
`;
