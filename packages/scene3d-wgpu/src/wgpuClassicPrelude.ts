import { getWgpuColorAdjustmentMaterialFeature } from '@flighthq/render-wgpu/contract';
import type {
  LinearColor,
  Texture,
  WgpuClassicDefineKey,
  WgpuClassicPipeline,
  WgpuColorAdjustmentMaterialFeature,
  WgpuRenderState,
  WgpuSkinningAdapter,
} from '@flighthq/types/contract';

import { WGPU_MESH_FRAGMENT_TAIL } from './wgpuMeshFragmentTail';
import {
  createWgpuMeshPipeline,
  ensureWgpuPerMapMaterialBinding,
  ensureWgpuScene3DPipeline,
  ensureWgpuShadowSampleLayout,
  getWgpuMeshPreludeWgsl,
  getWgpuMaterialSampler,
  resolveWgpuMaterialTextureView,
  spliceWgpuColorAdjustmentPrelude,
  stashWgpuUvTransform,
  WGPU_DIRECTIONAL_SHADOW_WGSL,
} from './wgpuMeshPipeline';
import { getWgpuScene3DRuntime, getWgpuSkinningAdapter } from './wgpuScene3DRuntime';
// Ensures (and caches per material reference) the classic Material bind group — a uniform buffer + the
// shared sampler + the placeholder diffuse/specular/normal textures — and rewrites its uniform with
// this surface's linear diffuse + specular colors, shininess, and alpha cutoff. Mirrors scene-gl's
// bindGl{Lambert,Phong,BlinnPhong}MaterialUniforms. Returns the bind group for the caller to set at
// group(2).
export function bindWgpuClassicSurface(
  state: WgpuRenderState,
  pipeline: Readonly<WgpuClassicPipeline>,
  materialKey: object,
  diffuse: Readonly<LinearColor>,
  specular: Readonly<LinearColor>,
  shininess: number,
  alphaCutoff: number,
  diffuseMap: Readonly<Texture> | null,
  specularMap: Readonly<Texture> | null,
  normalMap: Readonly<Texture> | null,
  alphaMap: Readonly<Texture> | null,
): GPUBindGroup {
  // Re-resolve the primary sampler + map views every bind so a live material-map mutation (swap,
  // unready→ready, image replacement, version bump, primary-sampler change) is picked up; the views land
  // in a REUSED module scratch so the steady-state re-bind of an unchanged material allocates nothing.
  // ensureWgpuPerMapMaterialBinding rebuilds the bind group only when a view/sampler actually differs.
  _samplerScratch[0] = getWgpuMaterialSampler(state, diffuseMap);
  _samplerScratch[1] = getWgpuMaterialSampler(state, specularMap);
  _samplerScratch[2] = getWgpuMaterialSampler(state, normalMap);
  _samplerScratch[3] = getWgpuMaterialSampler(state, alphaMap);
  _viewScratch[0] = resolveWgpuMaterialTextureView(state, diffuseMap);
  _viewScratch[1] = resolveWgpuMaterialTextureView(state, specularMap);
  _viewScratch[2] = resolveWgpuMaterialTextureView(state, normalMap);
  _viewScratch[3] = resolveWgpuMaterialTextureView(state, alphaMap);
  const binding = ensureWgpuPerMapMaterialBinding(
    state,
    materialKey,
    pipeline.materialBindGroupLayout,
    CLASSIC_UNIFORM_BYTES,
    _samplerScratch,
    _viewScratch,
  );

  _scratch[0] = diffuse[0];
  _scratch[1] = diffuse[1];
  _scratch[2] = diffuse[2];
  _scratch[3] = diffuse[3];
  _scratch[4] = specular[0];
  _scratch[5] = specular[1];
  _scratch[6] = specular[2];
  _scratch[7] = specular[3];
  _scratch[8] = shininess;
  _scratch[9] = alphaCutoff;
  _scratch[10] = 0;
  _scratch[11] = 0;
  state.device.queue.writeBuffer(binding.buffer, 0, _scratch.buffer, 0, CLASSIC_UNIFORM_BYTES);
  // The diffuse map's uv transform drives the shared vertex-scene2d uv the classic maps sample.
  stashWgpuUvTransform(state, diffuseMap);
  return binding.bindGroup;
}

// A short, stable, order-independent string identity for a classic define key, used as the pipeline-
// cache key (combined with the color format). The lighting model is encoded first (l/p/b) so the three
// models never collide, followed by the feature flags. Two keys with the same model + flags produce
// the same string and so share a compiled pipeline.
export function buildWgpuClassicDefineKey(key: Readonly<WgpuClassicDefineKey>): string {
  const model = key.lightingModel === 'phong' ? 'p' : key.lightingModel === 'blinnphong' ? 'b' : 'l';
  return `${model}${key.alphaMaskEnabled ? 'm' : '-'}${key.doubleSided ? 'd' : '-'}${key.hasDiffuseMap ? 'd' : '-'}${
    key.hasSpecularMap ? 's' : '-'
  }${key.hasNormalMap ? 'n' : '-'}${key.hasAlphaMap ? 'a' : '-'}${key.hasColorMatrix ? 'x' : key.hasColorAdjustment ? 'c' : ''}`;
}

// Compiles the classic module for a define key and builds the render pipeline for the given color
// format, with the group(2) material bind-group layout (uniform + one sampler per map +
// diffuse/specular/normal/alpha textures). Pure GPU work — no caching — used by
// ensureWgpuClassicPipeline.
export function compileWgpuClassicPipeline(
  state: WgpuRenderState,
  key: Readonly<WgpuClassicDefineKey>,
  format: GPUTextureFormat,
  blended = false,
  skinned = false,
  colorAdjustmentFeature: Readonly<WgpuColorAdjustmentMaterialFeature> | null = null,
): WgpuClassicPipeline {
  const device = state.device;
  const module = device.createShaderModule({
    code: getWgpuClassicModuleSourceForKey(key, skinned, getWgpuSkinningAdapter(state), colorAdjustmentFeature),
  });
  const materialBindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      { binding: 4, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      { binding: 5, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 6, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 7, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 8, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
    ],
  });
  // The group(3) shadow-sample layout opts this pipeline into directional shadow reception: the pipeline
  // layout gains [Frame, Draw, Material, Shadow] and beginWgpuMeshDraw binds the shared shadow group each
  // draw (the real depth map when drawWgpuScene3DShadowMap ran this frame, else a gated-off 1x1 dummy).
  return createWgpuMeshPipeline(state, {
    blended,
    doubleSided: key.doubleSided,
    format,
    materialBindGroupLayout,
    module,
    shadowBindGroupLayout: ensureWgpuShadowSampleLayout(state),
    skinned,
  });
}

// Resolves the classic pipeline for a define key + color format, compiling and caching it on first use
// through the shared scene pipeline cache under the `classic:` family namespace, so each model +
// feature/format variant is compiled at most once per state and reused every frame.
export function ensureWgpuClassicPipeline(
  state: WgpuRenderState,
  key: Readonly<WgpuClassicDefineKey>,
  format: GPUTextureFormat,
): WgpuClassicPipeline {
  const fullKey: WgpuClassicDefineKey = {
    ...key,
    hasColorAdjustment: getWgpuScene3DRuntime(state).activeColorAdjustmentRun,
    hasColorMatrix: getWgpuScene3DRuntime(state).activeColorMatrixRun,
  };
  return ensureWgpuScene3DPipeline(
    state,
    `classic:${format}|${buildWgpuClassicDefineKey(fullKey)}`,
    (blended, skinned) =>
      compileWgpuClassicPipeline(
        state,
        fullKey,
        format,
        blended,
        skinned,
        getWgpuColorAdjustmentMaterialFeature(state),
      ),
  );
}

// The full WGSL module source for a define key: the const-flag block (lighting model first) + the
// shared mesh prelude (Frame/Draw/vs_main) + the classic material block + fs_main.
export function getWgpuClassicModuleSourceForKey(
  key: Readonly<WgpuClassicDefineKey>,
  skinned = false,
  skinning: Readonly<WgpuSkinningAdapter> | null = null,
  colorAdjustmentFeature: Readonly<WgpuColorAdjustmentMaterialFeature> | null = null,
): string {
  let source = assembleWgpuClassicModuleSource(key, skinned, skinning, CLASSIC_WGSL_BODY);
  if ((key.hasColorAdjustment || key.hasColorMatrix) && colorAdjustmentFeature !== null) {
    source = spliceWgpuColorAdjustmentPrelude(source, colorAdjustmentFeature, key.hasColorMatrix).replace(
      '  return flightPremultipliedOutput(vec4f(radiance, flightMeshCoverage(diffuse.a, in.objectAlpha, draw.params.y)));',
      `  var flightColor = vec4f(radiance, diffuse.a);
  flightColor = ${
    key.hasColorMatrix
      ? 'applyFlightColorMatrix(flightColor, draw.flightColorMatrix0, draw.flightColorMatrix1, draw.flightColorMatrix2, draw.flightColorMatrix3, draw.flightColorMatrixOffset)'
      : 'applyFlightColorAdjustment(flightColor, draw.flightColorScale, draw.flightColorBias)'
  };
  flightColor.a = flightMeshCoverage(flightColor.a, in.objectAlpha, draw.params.y);
  return flightPremultipliedOutput(flightColor);`,
    );
  }
  return source;
}

// ShadedMaterial composes modifier declarations and contributions into the classic WGSL, but retains
// its intentionally extensible legacy group(2) layout: one sampler at binding 1, base textures at 2..5,
// and modifier textures at 6+. Keep that source contract separate from the per-map classic pipeline so
// changing classic's sampler layout cannot collide with shaded modifier bindings.
export function getWgpuClassicSharedSamplerModuleSourceForKey(
  key: Readonly<WgpuClassicDefineKey>,
  skinned = false,
  skinning: Readonly<WgpuSkinningAdapter> | null = null,
): string {
  return assembleWgpuClassicModuleSource(key, skinned, skinning, CLASSIC_SHARED_SAMPLER_WGSL_BODY);
}

function assembleWgpuClassicModuleSource(
  key: Readonly<WgpuClassicDefineKey>,
  skinned: boolean,
  skinning: Readonly<WgpuSkinningAdapter> | null,
  body: string,
): string {
  return (
    `const LIGHTING_PHONG : bool = ${key.lightingModel === 'phong' ? 'true' : 'false'};\n` +
    `const LIGHTING_BLINNPHONG : bool = ${key.lightingModel === 'blinnphong' ? 'true' : 'false'};\n` +
    `const ALPHA_MASK : bool = ${key.alphaMaskEnabled ? 'true' : 'false'};\n` +
    `const DOUBLE_SIDED : bool = ${key.doubleSided ? 'true' : 'false'};\n` +
    `const HAS_DIFFUSE_MAP : bool = ${key.hasDiffuseMap ? 'true' : 'false'};\n` +
    `const HAS_SPECULAR_MAP : bool = ${key.hasSpecularMap ? 'true' : 'false'};\n` +
    `const HAS_NORMAL_MAP : bool = ${key.hasNormalMap ? 'true' : 'false'};\n` +
    `const HAS_ALPHA_MAP : bool = ${key.hasAlphaMap ? 'true' : 'false'};\n` +
    getWgpuMeshPreludeWgsl(skinned, skinning) +
    body
  );
}

// Classic material uniform: diffuse vec4f (16) + specular vec4f (16) + params vec4f (16) = 48 bytes /
// 12 floats. params.x = shininess, params.y = alphaCutoff.
const CLASSIC_UNIFORM_BYTES = 48;

const CLASSIC_WGSL_BODY = /* wgsl */ `${WGPU_MESH_FRAGMENT_TAIL}
struct ClassicMaterial {
  diffuse : vec4f,   // linear rgba
  specular : vec4f,  // linear rgb; a unused
  params : vec4f,    // x = shininess, y = alphaCutoff
};

@group(2) @binding(0) var<uniform> material : ClassicMaterial;
@group(2) @binding(1) var diffuseSampler : sampler;
@group(2) @binding(2) var specularSampler : sampler;
@group(2) @binding(3) var normalSampler : sampler;
@group(2) @binding(4) var alphaSampler : sampler;
@group(2) @binding(5) var diffuseTexture : texture_2d<f32>;
@group(2) @binding(6) var specularTexture : texture_2d<f32>;
@group(2) @binding(7) var normalTexture : texture_2d<f32>;
@group(2) @binding(8) var alphaTexture : texture_2d<f32>;

${WGPU_DIRECTIONAL_SHADOW_WGSL}

// Smooth finite-range window over inverse-square falloff. A non-positive inverse range means
// unlimited range, matching packScene3DLightBlock and the GL classic/PBR preludes.
fn rangeWindow(dist2 : f32, invSqrRange : f32) -> f32 {
  if (invSqrRange <= 0.0) {
    return 1.0;
  }
  let factor = clamp(1.0 - dist2 * invSqrRange, 0.0, 1.0);
  return factor * factor;
}

// One classic-light contribution shared by directional, point, and spot lights. Keeping the BRDF in
// one function prevents the positional families from drifting from the directional model.
fn shadeClassicLight(normal : vec3f, lightDir : vec3f, lightColor : vec3f, diffuseRgb : vec3f,
                     specularColor : vec3f, worldPosition : vec3f) -> vec3f {
  let nDotL = max(dot(normal, lightDir), 0.0);
  var result = diffuseRgb * nDotL * lightColor;
  if ((LIGHTING_PHONG || LIGHTING_BLINNPHONG) && nDotL > 0.0) {
    let viewDir = normalize(frame.cameraPosition.xyz - worldPosition);
    var specAngle = 0.0;
    if (LIGHTING_PHONG) {
      specAngle = max(dot(reflect(-lightDir, normal), viewDir), 0.0);
    } else {
      specAngle = max(dot(normal, normalize(lightDir + viewDir)), 0.0);
    }
    let specular = pow(specAngle, max(material.params.x, 1.0));
    result = result + specular * specularColor * lightColor;
  }
  return result;
}

@fragment fn fs_main(in : VertexOutput, @builtin(front_facing) isFront : bool) -> @location(0) vec4f {
  var diffuse = material.diffuse * in.instanceColor;
  if (HAS_DIFFUSE_MAP) {
    let sampled = textureSample(diffuseTexture, diffuseSampler, in.uv);
    diffuse = vec4f(diffuse.rgb * sampled.rgb, diffuse.a * sampled.a);
  }

  // Dedicated coverage (opacity) map: its green channel is linear data, multiplied into alpha before
  // the alpha-mask cutoff so 'mask' cutout and 'blend' transparency both see the combined coverage.
  if (HAS_ALPHA_MAP) {
    diffuse.a = diffuse.a * textureSample(alphaTexture, alphaSampler, in.uv).g;
  }

  if (ALPHA_MASK && diffuse.a < material.params.y) {
    discard;
  }
  if (ALPHA_MASK) {
    diffuse.a = 1.0;
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
    var tangentNormal = textureSample(normalTexture, normalSampler, in.uv).xyz * 2.0 - vec3f(1.0);
    let tbn = mat3x3f(tangent, bitangent, geometricNormal);
    normal = normalize(tbn * tangentNormal);
  }

  // Specular color is resolved here in UNIFORM control flow. WGSL forbids textureSample inside the
  // per-pixel lighting branch below (it depends on nDotL, a non-uniform value), so the map sample is
  // hoisted out. It starts at the material specular; when a specular map is present its sampled value
  // multiplies in just below (an absent map binds a placeholder view and this stays the flat specular).
  var specularColor = material.specular.rgb;
  if (HAS_SPECULAR_MAP) {
    let sampledSpecular = textureSample(specularTexture, specularSampler, in.uv);
    specularColor = specularColor * sampledSpecular.rgb;
  }

  var radiance = vec3f(0.0);

  // Directional light: -direction is the surface-to-light vector (light travels along direction).
  // The whole directional contribution (diffuse + specular) is PCF shadow-mapped, mirroring the PBR path;
  // sampleDirectionalShadow returns 1.0 when no shadow map is bound, so an unshadowed scene is unchanged.
  if (frame.lightDirection.w > 0.5) {
    let lightDir = normalize(-frame.lightDirection.xyz);
    let direct = shadeClassicLight(normal, lightDir, frame.directionalRadiance.rgb, diffuse.rgb,
                                   specularColor, in.worldPosition);
    radiance = radiance + direct * sampleDirectionalShadow(in.worldPosition, geometricNormal);
  }

  // Point lights: surface-to-light direction with smooth inverse-square range falloff.
  let pointCount = u32(frame.punctualCounts.x);
  for (var point = 0u; point < 4u; point = point + 1u) {
    if (point >= pointCount) { break; }
    let toLight = frame.pointLights[point * 2u].xyz - in.worldPosition;
    let dist2 = dot(toLight, toLight);
    let lightDir = toLight * inverseSqrt(max(dist2, 1e-8));
    let atten = rangeWindow(dist2, frame.pointLights[point * 2u + 1u].w) / max(dist2, 1e-4);
    radiance = radiance + shadeClassicLight(normal, lightDir,
      frame.pointLights[point * 2u + 1u].xyz * atten, diffuse.rgb, specularColor, in.worldPosition);
  }

  // Spot lights: point attenuation multiplied by the smooth inner/outer cone window.
  let spotCount = u32(frame.punctualCounts.y);
  for (var spot = 0u; spot < 4u; spot = spot + 1u) {
    if (spot >= spotCount) { break; }
    let toLight = frame.spotLights[spot * 4u].xyz - in.worldPosition;
    let dist2 = dot(toLight, toLight);
    let lightDir = toLight * inverseSqrt(max(dist2, 1e-8));
    let atten = rangeWindow(dist2, frame.spotLights[spot * 4u + 1u].w) / max(dist2, 1e-4);
    let cone = smoothstep(frame.spotLights[spot * 4u + 3u].y, frame.spotLights[spot * 4u + 3u].x,
                          dot(normalize(frame.spotLights[spot * 4u + 2u].xyz), -lightDir));
    radiance = radiance + shadeClassicLight(normal, lightDir,
      frame.spotLights[spot * 4u + 1u].xyz * atten * cone, diffuse.rgb, specularColor, in.worldPosition);
  }

  // Ambient term: flat irradiance over the diffuse albedo.
  if (frame.ambientRadiance.w > 0.5) {
    radiance = radiance + diffuse.rgb * frame.ambientRadiance.rgb;
  }

  // Hemisphere fill: sky/ground gradient blended by the normal's up-axis alignment.
  let hemisphereCount = u32(frame.punctualCounts.z);
  for (var hemisphere = 0u; hemisphere < 4u; hemisphere = hemisphere + 1u) {
    if (hemisphere >= hemisphereCount) { break; }
    let factor = 0.5 + 0.5 * dot(normal, frame.hemisphereLights[hemisphere * 3u + 2u].xyz);
    radiance = radiance + mix(frame.hemisphereLights[hemisphere * 3u + 1u].xyz,
      frame.hemisphereLights[hemisphere * 3u].xyz, factor) * diffuse.rgb;
  }

  return flightPremultipliedOutput(vec4f(radiance, flightMeshCoverage(diffuse.a, in.objectAlpha, draw.params.y)));
}
`;

const CLASSIC_SHARED_SAMPLER_WGSL_BODY = CLASSIC_WGSL_BODY.replace(
  `@group(2) @binding(1) var diffuseSampler : sampler;
@group(2) @binding(2) var specularSampler : sampler;
@group(2) @binding(3) var normalSampler : sampler;
@group(2) @binding(4) var alphaSampler : sampler;
@group(2) @binding(5) var diffuseTexture : texture_2d<f32>;
@group(2) @binding(6) var specularTexture : texture_2d<f32>;
@group(2) @binding(7) var normalTexture : texture_2d<f32>;
@group(2) @binding(8) var alphaTexture : texture_2d<f32>;`,
  `@group(2) @binding(1) var materialSampler : sampler;
@group(2) @binding(2) var diffuseTexture : texture_2d<f32>;
@group(2) @binding(3) var specularTexture : texture_2d<f32>;
@group(2) @binding(4) var normalTexture : texture_2d<f32>;
@group(2) @binding(5) var alphaTexture : texture_2d<f32>;`,
)
  .replaceAll('diffuseSampler', 'materialSampler')
  .replaceAll('specularSampler', 'materialSampler')
  .replaceAll('normalSampler', 'materialSampler')
  .replaceAll('alphaSampler', 'materialSampler');

const _scratch = new Float32Array(CLASSIC_UNIFORM_BYTES / 4);
const _samplerScratch = new Array<GPUSampler>(4);
// Reused per-bind resolved-view scratch (diffuse, specular, normal, alpha) so a steady-state re-bind
// allocates nothing; ensureWgpuPerMapMaterialBinding copies it into the binding only on create/rebuild.
const _viewScratch = new Array<GPUTextureView>(4);
