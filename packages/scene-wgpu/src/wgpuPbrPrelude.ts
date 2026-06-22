// The shared Wgpu PBR prelude: the WGSL vertex + fragment uber-shader for the StandardPbr forward-lit
// path — the WGSL mirror of scene-gl's glPbrPrelude. One module source is specialized per material at
// compile time by prepending a const-flag block (see WgpuPbrDefineKey / buildWgpuPbrDefineSource):
// WGSL has no preprocessor, so each feature flag is emitted as `const FLAG : bool = …;` and the shader
// branches on it (the dead branch is folded away by the pipeline compiler). The maps-present /
// double-sided / alpha-mask variants are flag branches of one module, never separate files.
//
// The lighting model is Cook-Torrance: GGX normal distribution, Smith height-correlated visibility,
// and a Fresnel-Schlick approximation, evaluated over the interpolated world-space normal/tangent/uv
// for one directional + one ambient light read from the Frame uniform. The fragment stage outputs
// LINEAR HDR radiance (no tonemap / gamma here — the effect pipeline's resolve/tonemap pass owns
// that), matching the rgba16float scene target.
//
// The Frame uniform mirrors SceneLightBlock.data: a directional term { direction.xyz, _pad,
// radiance.rgb, _pad } then an ambient term { radiance.rgb, _pad } — radiance is already linear and
// premultiplied by intensity at pack time, so the shader never decodes sRgb. directionalCount /
// ambientCount (0 or 1) gate each term's contribution.
//
// Bind groups (must match standardPbrWgpuMeshMaterialRenderer):
//   group(0) Frame    : viewProjection, cameraPosition, directional + ambient light — uniform.
//   group(1) Draw     : world + normalMatrix — uniform (dynamic offset per draw).
//   group(2) Material : baseColor/emissive/factors/flags uniform + sampler + 5 optional maps.

// The feature flags that select an uber-shader variant. Each toggles a `const … : bool` in the
// prelude and is hashed into the pipeline-cache key (buildWgpuPbrDefineKey), so distinct flag sets
// compile and cache as distinct pipelines. `hasBaseColorMap` / `hasNormalMap` enable the textured
// paths; `alphaMaskEnabled` enables the alpha-cutoff discard for 'mask' materials; `doubleSided`
// flips the normal toward the viewer on back faces (paired with the pipeline's cull-none state).
export interface WgpuPbrDefineKey {
  alphaMaskEnabled: boolean;
  doubleSided: boolean;
  hasBaseColorMap: boolean;
  hasNormalMap: boolean;
}

// A short, stable, order-independent string identity for a define key, used as the pipeline-cache map
// key (combined with the color-attachment format). Two keys with the same flags produce the same
// string and so share a compiled pipeline.
export function buildWgpuPbrDefineKey(key: Readonly<WgpuPbrDefineKey>): string {
  return `${key.alphaMaskEnabled ? 'm' : '-'}${key.doubleSided ? 'd' : '-'}${key.hasBaseColorMap ? 'b' : '-'}${
    key.hasNormalMap ? 'n' : '-'
  }`;
}

// Builds the leading `const USE_… : bool = …;` block for a define key, prepended to the module body
// before compile. Pure string assembly; the same key always yields the same source, which is what
// makes the pipeline cache by define key sound.
export function buildWgpuPbrDefineSource(key: Readonly<WgpuPbrDefineKey>): string {
  return (
    `const ALPHA_MASK : bool = ${key.alphaMaskEnabled ? 'true' : 'false'};\n` +
    `const DOUBLE_SIDED : bool = ${key.doubleSided ? 'true' : 'false'};\n` +
    `const HAS_BASE_COLOR_MAP : bool = ${key.hasBaseColorMap ? 'true' : 'false'};\n` +
    `const HAS_NORMAL_MAP : bool = ${key.hasNormalMap ? 'true' : 'false'};\n`
  );
}

// The static WGSL module body (everything after the const-flag block): bind-group structs, the
// Cook-Torrance BRDF, and the vs_main/fs_main entry points. Toggled by the const flags emitted ahead
// of it; the compiler folds the dead branch away.
export function getWgpuPbrModuleBody(): string {
  return PBR_WGSL_BODY;
}

// The full WGSL module source for a define key (flag block + body), ready to hand to
// device.createShaderModule. Convenience over buildWgpuPbrDefineSource + getWgpuPbrModuleBody.
export function getWgpuPbrModuleSourceForKey(key: Readonly<WgpuPbrDefineKey>): string {
  return buildWgpuPbrDefineSource(key) + PBR_WGSL_BODY;
}

const PBR_WGSL_BODY = /* wgsl */ `
const PI : f32 = 3.14159265359;

struct Frame {
  viewProjection : mat4x4f,
  cameraPosition : vec4f,
  lightDirection : vec4f,       // xyz = directional light travel direction; w = directionalCount
  directionalRadiance : vec4f,  // rgb = linear premultiplied radiance
  ambientRadiance : vec4f,      // rgb = linear premultiplied radiance; w = ambientCount
};

struct Draw {
  world : mat4x4f,
  normalMatrix : mat3x3f,
};

struct MaterialBlock {
  baseColor : vec4f,   // linear rgba
  emissive : vec4f,    // linear rgb * strength; a unused
  factors : vec4f,     // metallic, roughness, normalScale, occlusionStrength
  flags : vec4f,       // alphaCutoff, _, _, _
};

@group(0) @binding(0) var<uniform> frame : Frame;
@group(1) @binding(0) var<uniform> draw : Draw;
@group(2) @binding(0) var<uniform> material : MaterialBlock;
@group(2) @binding(1) var materialSampler : sampler;
@group(2) @binding(2) var baseColorTexture : texture_2d<f32>;
@group(2) @binding(3) var metallicRoughnessTexture : texture_2d<f32>;
@group(2) @binding(4) var normalTexture : texture_2d<f32>;
@group(2) @binding(5) var occlusionTexture : texture_2d<f32>;
@group(2) @binding(6) var emissiveTexture : texture_2d<f32>;

struct VertexOutput {
  @builtin(position) clipPosition : vec4f,
  @location(0) worldPosition : vec3f,
  @location(1) worldNormal : vec3f,
  @location(2) worldTangent : vec4f,
  @location(3) uv : vec2f,
};

@vertex fn vs_main(
  @location(0) position : vec3f,
  @location(1) normal : vec3f,
  @location(2) tangent : vec4f,
  @location(3) uv : vec2f,
) -> VertexOutput {
  var out : VertexOutput;
  let world = draw.world * vec4f(position, 1.0);
  out.worldPosition = world.xyz;
  out.clipPosition = frame.viewProjection * world;
  out.worldNormal = draw.normalMatrix * normal;
  out.worldTangent = vec4f(draw.normalMatrix * tangent.xyz, tangent.w);
  out.uv = uv;
  return out;
}

// sRgb albedo texels are gamma-encoded; decode to linear before lighting.
fn srgbToLinear(c : vec3f) -> vec3f {
  let lo = c / 12.92;
  let hi = pow((c + vec3f(0.055)) / 1.055, vec3f(2.4));
  return select(lo, hi, c > vec3f(0.04045));
}

fn distributionGgx(nDotH : f32, roughness : f32) -> f32 {
  let a = roughness * roughness;
  let a2 = a * a;
  let d = nDotH * nDotH * (a2 - 1.0) + 1.0;
  return a2 / max(PI * d * d, 1e-7);
}

fn visibilitySmith(nDotV : f32, nDotL : f32, roughness : f32) -> f32 {
  let a = roughness * roughness;
  let k = a * 0.5;
  let gv = nDotV / (nDotV * (1.0 - k) + k);
  let gl = nDotL / (nDotL * (1.0 - k) + k);
  return gv * gl;
}

fn fresnelSchlick(cosTheta : f32, f0 : vec3f) -> vec3f {
  return f0 + (vec3f(1.0) - f0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

@fragment fn fs_main(in : VertexOutput, @builtin(front_facing) isFront : bool) -> @location(0) vec4f {
  var baseColor = material.baseColor;
  if (HAS_BASE_COLOR_MAP) {
    let sampled = textureSample(baseColorTexture, materialSampler, in.uv);
    baseColor = vec4f(baseColor.rgb * srgbToLinear(sampled.rgb), baseColor.a * sampled.a);
  }

  if (ALPHA_MASK && baseColor.a < material.flags.x) {
    discard;
  }

  var geometricNormal = normalize(in.worldNormal);
  // Double-sided materials flip the normal for back faces so both sides shade correctly.
  if (DOUBLE_SIDED && !isFront) {
    geometricNormal = -geometricNormal;
  }

  var normal = geometricNormal;
  if (HAS_NORMAL_MAP) {
    let tangent = normalize(in.worldTangent.xyz);
    let bitangent = cross(geometricNormal, tangent) * in.worldTangent.w;
    var tangentNormal = textureSample(normalTexture, materialSampler, in.uv).xyz * 2.0 - vec3f(1.0);
    tangentNormal = vec3f(tangentNormal.xy * material.factors.z, tangentNormal.z);
    let tbn = mat3x3f(tangent, bitangent, geometricNormal);
    normal = normalize(tbn * tangentNormal);
  }

  let viewDir = normalize(frame.cameraPosition.xyz - in.worldPosition);
  let nDotV = max(dot(normal, viewDir), 1e-4);

  let roughness = clamp(material.factors.y, 0.04, 1.0);
  let metallic = clamp(material.factors.x, 0.0, 1.0);
  let albedo = baseColor.rgb;
  let f0 = mix(vec3f(0.04), albedo, metallic);
  let diffuseColor = albedo * (1.0 - metallic);

  var radiance = vec3f(0.0);

  // Directional light: -direction is the surface-to-light vector (light travels along direction).
  if (frame.lightDirection.w > 0.5) {
    let lightDir = normalize(-frame.lightDirection.xyz);
    let halfVec = normalize(viewDir + lightDir);
    let nDotL = max(dot(normal, lightDir), 0.0);
    let nDotH = max(dot(normal, halfVec), 0.0);
    let vDotH = max(dot(viewDir, halfVec), 0.0);

    let d = distributionGgx(nDotH, roughness);
    let vis = visibilitySmith(nDotV, nDotL, roughness);
    let fresnel = fresnelSchlick(vDotH, f0);

    let specular = d * vis * fresnel;
    let kd = (vec3f(1.0) - fresnel) * (1.0 - metallic);
    let brdf = kd * diffuseColor / PI + specular;
    radiance = radiance + brdf * frame.directionalRadiance.rgb * nDotL;
  }

  // Ambient term: flat irradiance over the diffuse albedo (no IBL specular yet).
  if (frame.ambientRadiance.w > 0.5) {
    radiance = radiance + diffuseColor * frame.ambientRadiance.rgb;
  }

  radiance = radiance + material.emissive.rgb;

  return vec4f(radiance, baseColor.a);
}
`;
