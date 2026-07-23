import type { GlToonDefineKey, GlToonProgram, GlRenderState } from '@flighthq/types';
import { MAX_FORWARD_LIGHTS } from '@flighthq/types';

import { GL_MESH_LIGHT_BLOCK_GLSL, resolveGlLitLocations } from './glLitProgram';
import {
  GL_SKIN_VERTEX_DECLARATIONS_GLSL,
  GL_UV_TRANSFORM_VERTEX_GLSL,
  compileGlProgram,
  ensureGlSceneProgram,
} from './glMeshProgram';
import { getGlSceneRuntime } from './glSceneRuntime';
// A short, stable, order-independent string identity for a Toon define key, used as the program-
// cache key. Two keys with the same flags produce the same string and so share a compiled program.
export function buildGlToonDefineKey(key: Readonly<GlToonDefineKey>): string {
  return `${key.alphaMaskEnabled ? 'm' : '-'}${key.hasBaseColorMap ? 'b' : '-'}${key.hasRamp ? 'r' : '-'}${
    key.hasUvTransform ? 'u' : '-'
  }${key.hasSkin ? 'k' : '-'}`;
}

// Compiles the Toon uber-shader for a define key, links it, and resolves its uniform locations.
// Spreads the standard lit locations (resolveGlLitLocations) then adds the Toon material uniforms
// plus the shared model/normal/view-projection vertex transforms. Pure GL work — no caching — used
// by ensureGlToonProgram. Throws on a compile/link failure, which is a programmer error (a malformed
// prelude), not an expected runtime condition.
export function compileGlToonProgram(gl: WebGL2RenderingContext, key: Readonly<GlToonDefineKey>): GlToonProgram {
  const program = compileGlProgram(gl, getGlToonVertexSourceForKey(key), getGlToonFragmentSourceForKey(key));
  return {
    ...resolveGlLitLocations(gl, program),
    program,
    locAlphaCutoff: gl.getUniformLocation(program, 'u_alphaCutoff'),
    locBaseColor: gl.getUniformLocation(program, 'u_baseColor'),
    locBaseColorMap: gl.getUniformLocation(program, 'u_baseColorMap'),
    locJointTexture: gl.getUniformLocation(program, 'u_jointTexture'),
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
  // Fold the render-state skinned-run flag into the variant so a skinned draw of an otherwise-identical
  // material compiles + caches its own HAS_SKIN program, without the material renderer knowing.
  const fullKey: GlToonDefineKey = {
    ...key,
    hasSkin: getGlSceneRuntime(state).activeSkinnedRun,
  };
  return ensureGlSceneProgram(state, `toon:${buildGlToonDefineKey(fullKey)}`, (gl) =>
    compileGlToonProgram(gl, fullKey),
  );
}

// The full fragment source for a define key (define block + body), ready to hand to the GL compiler.
export function getGlToonFragmentSourceForKey(key: Readonly<GlToonDefineKey>): string {
  return buildGlToonDefineSource(key) + TOON_FRAGMENT_BODY;
}

// The full vertex source for a define key (define block + body), ready to hand to the GL compiler.
export function getGlToonVertexSourceForKey(key: Readonly<GlToonDefineKey>): string {
  const skin = key.hasSkin ? GL_SKIN_VERTEX_DECLARATIONS_GLSL : '';
  return buildGlToonDefineSource(key) + skin + TOON_VERTEX_BODY;
}

// Builds the leading "#version 300 es\n#define ..." block for a define key, to be prepended to the
// vertex and fragment prelude bodies before compile. Pure string assembly; the same key always
// yields the same source, which is what makes the program cache by define key sound.
function buildGlToonDefineSource(key: Readonly<GlToonDefineKey>): string {
  let defines = `#version 300 es\n#define MAX_FORWARD_LIGHTS ${MAX_FORWARD_LIGHTS}\n`;
  if (key.alphaMaskEnabled) defines += '#define ALPHA_MASK\n';
  if (key.hasBaseColorMap) defines += '#define HAS_BASE_COLOR_MAP\n';
  if (key.hasRamp) defines += '#define HAS_RAMP\n';
  if (key.hasUvTransform) defines += '#define HAS_UV_TRANSFORM\n';
  if (key.hasSkin) defines += '#define HAS_SKIN\n';
  return defines;
}

const TOON_VERTEX_BODY = `
layout(location = 0) in vec3 a_position;
layout(location = 1) in vec3 a_normal;
layout(location = 3) in vec2 a_uv0;

uniform mat4 u_viewProjection;
uniform mat4 u_model;
uniform mat3 u_normalMatrix;
${GL_UV_TRANSFORM_VERTEX_GLSL}
out vec3 v_worldPosition;
out vec3 v_normal;
out vec2 v_uv0;

void main() {
#ifdef HAS_SKIN
  mat4 skin = skinMatrix();
  vec4 localPosition = skin * vec4(a_position, 1.0);
  vec3 localNormal = mat3(skin) * a_normal;
#else
  vec4 localPosition = vec4(a_position, 1.0);
  vec3 localNormal = a_normal;
#endif
  vec4 worldPosition = u_model * localPosition;
  v_worldPosition = worldPosition.xyz;
  v_normal = u_normalMatrix * localNormal;
  v_uv0 = applyUvTransform(a_uv0);
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

uniform float u_objectAlpha;

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
  // the base color and the directional radiance. The banded contribution is shadow-mapped like the
  // classic/PBR directional term; sampleDirectionalShadow is 1.0 when no shadow map is bound, so a toon
  // scene that never calls drawGlSceneShadowMap is unchanged.
  if (u_directionalCount > 0.5) {
    vec3 lightDir = normalize(-u_directional.xyz);
    float nDotL = clamp(dot(normal, lightDir), 0.0, 1.0);
#ifdef HAS_RAMP
    vec3 band = texture(u_ramp, vec2(nDotL, 0.5)).rgb;
    vec3 direct = baseColor.rgb * band * u_directionalRadiance.rgb;
#else
    float band = floor(nDotL * u_steps) / max(u_steps, 1.0);
    vec3 direct = baseColor.rgb * band * u_directionalRadiance.rgb;
#endif
    radiance += direct * sampleDirectionalShadow(v_worldPosition);
  }

  // Ambient term: flat irradiance over the base color (unbanded).
  if (u_ambientCount > 0.5) {
    radiance += baseColor.rgb * u_ambientRadiance;
  }

  fragColor = vec4(radiance, baseColor.a);
  fragColor.a *= u_objectAlpha;
}
`;
