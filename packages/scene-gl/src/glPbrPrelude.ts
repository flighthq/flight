// The shared Gl PBR prelude: the GLSL 300 es vertex + fragment uber-shader for the StandardPbr
// forward-lit path. One source string is specialized per material at compile time by prepending a
// define block (see GlPbrDefineKey / buildGlPbrDefineSource), so the maps-present / double-sided /
// alpha-mode variants are #ifdef branches of one shader, never separate files.
//
// The lighting model is Cook-Torrance: GGX normal distribution, Smith height-correlated
// visibility, and a Fresnel-Schlick approximation, evaluated over the interpolated world-space
// normal/tangent/uv for one directional + one ambient light read from the packed light block. The
// fragment shader outputs LINEAR HDR radiance (no tonemap / gamma here — the effect pipeline's
// resolve/tonemap pass owns that), matching the rgba16f scene target.
//
// The light block UBO mirrors SceneLightBlock.data exactly (std140): a directional term
// { direction.xyz, _pad, radiance.rgb, _pad } at offset 0 then an ambient term { radiance.rgb,
// _pad } — radiance is already linear and premultiplied by intensity at pack time, so the shader
// never decodes sRgb. u_directionalCount / u_ambientCount (0 or 1) gate each term's contribution.

// The feature flags that select an uber-shader variant. Each toggles an #ifdef in the prelude and
// is hashed into the program-cache key (buildGlPbrDefineKey), so distinct flag sets compile and
// cache as distinct programs. `hasBaseColorMap` / `hasNormalMap` enable the textured paths;
// `alphaMaskEnabled` enables the alpha-cutoff discard for 'mask' materials.
export interface GlPbrDefineKey {
  alphaMaskEnabled: boolean;
  hasBaseColorMap: boolean;
  hasNormalMap: boolean;
}

// A short, stable, order-independent string identity for a define key, used as the program-cache
// map key. Two keys with the same flags produce the same string and so share a compiled program.
export function buildGlPbrDefineKey(key: Readonly<GlPbrDefineKey>): string {
  return `${key.alphaMaskEnabled ? 'm' : '-'}${key.hasBaseColorMap ? 'b' : '-'}${key.hasNormalMap ? 'n' : '-'}`;
}

// Builds the leading "#version 300 es\n#define ..." block for a define key, to be prepended to the
// vertex and fragment prelude bodies before compile. Pure string assembly; the same key always
// yields the same source, which is what makes the program cache by define key sound.
export function buildGlPbrDefineSource(key: Readonly<GlPbrDefineKey>): string {
  let defines = '#version 300 es\n';
  if (key.alphaMaskEnabled) defines += '#define ALPHA_MASK\n';
  if (key.hasBaseColorMap) defines += '#define HAS_BASE_COLOR_MAP\n';
  if (key.hasNormalMap) defines += '#define HAS_NORMAL_MAP\n';
  return defines;
}

// The fragment shader body (everything after the "#version 300 es" + defines block). Implements
// Cook-Torrance GGX/Smith/Fresnel-Schlick over one directional + one ambient light and writes
// linear HDR radiance to fragColor.
export function getGlPbrFragmentSource(): string {
  return PBR_FRAGMENT_BODY;
}

// The full fragment source for a define key (define block + body), ready to hand to the GL
// compiler. Convenience over buildGlPbrDefineSource + getGlPbrFragmentSource.
export function getGlPbrFragmentSourceForKey(key: Readonly<GlPbrDefineKey>): string {
  return buildGlPbrDefineSource(key) + PBR_FRAGMENT_BODY;
}

// The vertex shader body (everything after the "#version 300 es" + defines block). Transforms the
// canonical PBR vertex record (position/normal/tangent/uv0) by the model and view-projection
// matrices and passes world-space position, normal, tangent, and uv to the fragment stage.
export function getGlPbrVertexSource(): string {
  return PBR_VERTEX_BODY;
}

// The full vertex source for a define key (define block + body), ready to hand to the GL compiler.
export function getGlPbrVertexSourceForKey(key: Readonly<GlPbrDefineKey>): string {
  return buildGlPbrDefineSource(key) + PBR_VERTEX_BODY;
}

const PBR_VERTEX_BODY = `
layout(location = 0) in vec3 a_position;
layout(location = 1) in vec3 a_normal;
layout(location = 2) in vec4 a_tangent;
layout(location = 3) in vec2 a_uv0;

uniform mat4 u_viewProjection;
uniform mat4 u_model;
uniform mat3 u_normalMatrix;

out vec3 v_worldPosition;
out vec3 v_normal;
out vec4 v_tangent;
out vec2 v_uv0;

void main() {
  vec4 worldPosition = u_model * vec4(a_position, 1.0);
  v_worldPosition = worldPosition.xyz;
  v_normal = u_normalMatrix * a_normal;
  v_tangent = vec4(u_normalMatrix * a_tangent.xyz, a_tangent.w);
  v_uv0 = a_uv0;
  gl_Position = u_viewProjection * worldPosition;
}
`;

const PBR_FRAGMENT_BODY = `
precision highp float;

in vec3 v_worldPosition;
in vec3 v_normal;
in vec4 v_tangent;
in vec2 v_uv0;

uniform vec4 u_baseColor;
uniform float u_metallic;
uniform float u_roughness;
uniform float u_normalScale;
uniform vec3 u_emissive;
uniform float u_emissiveStrength;
uniform float u_alphaCutoff;
uniform vec3 u_cameraPosition;

uniform vec4 u_directional;
uniform vec4 u_directionalRadiance;
uniform vec3 u_ambientRadiance;
uniform float u_directionalCount;
uniform float u_ambientCount;

#ifdef HAS_BASE_COLOR_MAP
uniform sampler2D u_baseColorMap;
#endif
#ifdef HAS_NORMAL_MAP
uniform sampler2D u_normalMap;
#endif

out vec4 fragColor;

const float PI = 3.14159265359;

// sRgb albedo texels are gamma-encoded; decode to linear before lighting.
vec3 srgbToLinear(vec3 c) {
  vec3 lo = c / 12.92;
  vec3 hi = pow((c + 0.055) / 1.055, vec3(2.4));
  return mix(lo, hi, step(0.04045, c));
}

float distributionGgx(float nDotH, float roughness) {
  float a = roughness * roughness;
  float a2 = a * a;
  float d = nDotH * nDotH * (a2 - 1.0) + 1.0;
  return a2 / max(PI * d * d, 1e-7);
}

float visibilitySmith(float nDotV, float nDotL, float roughness) {
  float a = roughness * roughness;
  float k = a * 0.5;
  float gv = nDotV / (nDotV * (1.0 - k) + k);
  float gl = nDotL / (nDotL * (1.0 - k) + k);
  return gv * gl;
}

vec3 fresnelSchlick(float cosTheta, vec3 f0) {
  return f0 + (1.0 - f0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
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

  vec3 geometricNormal = normalize(v_normal);
  if (!gl_FrontFacing) geometricNormal = -geometricNormal;

  vec3 normal = geometricNormal;
#ifdef HAS_NORMAL_MAP
  vec3 tangent = normalize(v_tangent.xyz);
  vec3 bitangent = cross(geometricNormal, tangent) * v_tangent.w;
  vec3 tangentNormal = texture(u_normalMap, v_uv0).xyz * 2.0 - 1.0;
  tangentNormal.xy *= u_normalScale;
  mat3 tbn = mat3(tangent, bitangent, geometricNormal);
  normal = normalize(tbn * tangentNormal);
#endif

  vec3 viewDir = normalize(u_cameraPosition - v_worldPosition);
  float nDotV = max(dot(normal, viewDir), 1e-4);

  float roughness = clamp(u_roughness, 0.04, 1.0);
  float metallic = clamp(u_metallic, 0.0, 1.0);
  vec3 albedo = baseColor.rgb;
  vec3 f0 = mix(vec3(0.04), albedo, metallic);
  vec3 diffuseColor = albedo * (1.0 - metallic);

  vec3 radiance = vec3(0.0);

  // Directional light: -direction is the surface-to-light vector (light travels along direction).
  if (u_directionalCount > 0.5) {
    vec3 lightDir = normalize(-u_directional.xyz);
    vec3 halfVec = normalize(viewDir + lightDir);
    float nDotL = max(dot(normal, lightDir), 0.0);
    float nDotH = max(dot(normal, halfVec), 0.0);
    float vDotH = max(dot(viewDir, halfVec), 0.0);

    float d = distributionGgx(nDotH, roughness);
    float vis = visibilitySmith(nDotV, nDotL, roughness);
    vec3 fresnel = fresnelSchlick(vDotH, f0);

    vec3 specular = d * vis * fresnel;
    vec3 kd = (1.0 - fresnel) * (1.0 - metallic);
    vec3 brdf = kd * diffuseColor / PI + specular;
    radiance += brdf * u_directionalRadiance.rgb * nDotL;
  }

  // Ambient term: flat irradiance over the diffuse albedo (no IBL specular yet).
  if (u_ambientCount > 0.5) {
    radiance += diffuseColor * u_ambientRadiance;
  }

  radiance += u_emissive * u_emissiveStrength;

  fragColor = vec4(radiance, baseColor.a);
}
`;
