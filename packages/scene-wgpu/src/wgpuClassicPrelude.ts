import type {
  LinearColor,
  Texture,
  WgpuClassicDefineKey,
  WgpuClassicPipeline,
  WgpuMaterialBinding,
  WgpuRenderState,
} from '@flighthq/types';

import {
  createWgpuMeshPipeline,
  ensureWgpuScenePipeline,
  ensureWgpuShadowSampleLayout,
  getWgpuMaterialSampler,
  resolveWgpuMaterialTextureView,
  stashWgpuUvTransform,
  WGPU_MESH_PRELUDE_WGSL,
} from './wgpuMeshPipeline';
import { getWgpuSceneRuntime } from './wgpuSceneRuntime';
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
): GPUBindGroup {
  const scene = getWgpuSceneRuntime(state);
  let binding: WgpuMaterialBinding | undefined = scene.materialBindGroups.get(materialKey);
  if (binding === undefined) {
    const buffer = state.device.createBuffer({
      size: CLASSIC_UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const bindGroup = state.device.createBindGroup({
      layout: pipeline.materialBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer } },
        { binding: 1, resource: getWgpuMaterialSampler(state, diffuseMap) },
        { binding: 2, resource: resolveWgpuMaterialTextureView(state, diffuseMap) },
        { binding: 3, resource: resolveWgpuMaterialTextureView(state, specularMap) },
        { binding: 4, resource: resolveWgpuMaterialTextureView(state, normalMap) },
      ],
    });
    binding = { bindGroup, buffer };
    scene.materialBindGroups.set(materialKey, binding);
  }

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
  // The diffuse map's uv transform drives the shared vertex-stage uv the classic maps sample.
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
  }${key.hasNormalMap ? 'n' : '-'}`;
}

// Compiles the classic module for a define key and builds the render pipeline for the given color
// format, with the group(2) material bind-group layout (uniform + sampler + diffuse/specular/normal
// textures). Pure GPU work — no caching — used by ensureWgpuClassicPipeline.
export function compileWgpuClassicPipeline(
  state: WgpuRenderState,
  key: Readonly<WgpuClassicDefineKey>,
  format: GPUTextureFormat,
  blended = false,
): WgpuClassicPipeline {
  const device = state.device;
  const module = device.createShaderModule({ code: getWgpuClassicModuleSourceForKey(key) });
  const materialBindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
    ],
  });
  // The group(3) shadow-sample layout opts this pipeline into directional shadow reception: the pipeline
  // layout gains [Frame, Draw, Material, Shadow] and beginWgpuMeshDraw binds the shared shadow group each
  // draw (the real depth map when drawWgpuSceneShadowMap ran this frame, else a gated-off 1x1 dummy).
  return createWgpuMeshPipeline(state, {
    blended,
    doubleSided: key.doubleSided,
    format,
    materialBindGroupLayout,
    module,
    shadowBindGroupLayout: ensureWgpuShadowSampleLayout(state),
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
  return ensureWgpuScenePipeline(state, `classic:${format}|${buildWgpuClassicDefineKey(key)}`, (blended) =>
    compileWgpuClassicPipeline(state, key, format, blended),
  );
}

// The full WGSL module source for a define key: the const-flag block (lighting model first) + the
// shared mesh prelude (Frame/Draw/vs_main/srgbToLinear) + the classic material block + fs_main.
export function getWgpuClassicModuleSourceForKey(key: Readonly<WgpuClassicDefineKey>): string {
  return (
    `const LIGHTING_PHONG : bool = ${key.lightingModel === 'phong' ? 'true' : 'false'};\n` +
    `const LIGHTING_BLINNPHONG : bool = ${key.lightingModel === 'blinnphong' ? 'true' : 'false'};\n` +
    `const ALPHA_MASK : bool = ${key.alphaMaskEnabled ? 'true' : 'false'};\n` +
    `const DOUBLE_SIDED : bool = ${key.doubleSided ? 'true' : 'false'};\n` +
    `const HAS_DIFFUSE_MAP : bool = ${key.hasDiffuseMap ? 'true' : 'false'};\n` +
    `const HAS_SPECULAR_MAP : bool = ${key.hasSpecularMap ? 'true' : 'false'};\n` +
    `const HAS_NORMAL_MAP : bool = ${key.hasNormalMap ? 'true' : 'false'};\n` +
    WGPU_MESH_PRELUDE_WGSL +
    CLASSIC_WGSL_BODY
  );
}

// Classic material uniform: diffuse vec4f (16) + specular vec4f (16) + params vec4f (16) = 48 bytes /
// 12 floats. params.x = shininess, params.y = alphaCutoff.
const CLASSIC_UNIFORM_BYTES = 48;

const CLASSIC_WGSL_BODY = /* wgsl */ `
struct ClassicMaterial {
  diffuse : vec4f,   // linear rgba
  specular : vec4f,  // linear rgb; a unused
  params : vec4f,    // x = shininess, y = alphaCutoff
};

@group(2) @binding(0) var<uniform> material : ClassicMaterial;
@group(2) @binding(1) var materialSampler : sampler;
@group(2) @binding(2) var diffuseTexture : texture_2d<f32>;
@group(2) @binding(3) var specularTexture : texture_2d<f32>;
@group(2) @binding(4) var normalTexture : texture_2d<f32>;

// The directional shadow inputs (group 3), the shared shadow-sample layout ensureWgpuShadowSampleLayout
// builds and beginWgpuMeshDraw binds. matrix is the light view-projection (world -> shadow clip);
// params.x is the enabled flag (0 or 1). The WGSL mirror of scene-gl's u_shadowMap / u_shadowMatrix /
// u_shadowEnabled and wgpuPbrPrelude's Shadow.
struct Shadow {
  matrix : mat4x4f,
  params : vec4f,   // x = enabled (0 or 1)
};

@group(3) @binding(0) var<uniform> shadow : Shadow;
@group(3) @binding(1) var shadowMap : texture_depth_2d;
@group(3) @binding(2) var shadowSampler : sampler_comparison;

// Directional shadow factor at a world position: 1.0 fully lit, 0.0 fully shadowed, with 3x3 PCF —
// identical to wgpuPbrPrelude's copy. UV flips Y (WebGPU top-left origin), depthRef remaps GL-convention
// clip Z (-1..1) into WebGPU's 0..1 range; the comparison sampler ('less-equal') yields "current <=
// closest" per tap. Fragments outside the shadow frustum, or when no map is bound, read as lit.
fn sampleDirectionalShadow(worldPos : vec3f) -> f32 {
  if (shadow.params.x < 0.5) {
    return 1.0;
  }
  let clip = shadow.matrix * vec4f(worldPos, 1.0);
  let ndc = clip.xyz / clip.w;
  let uv = vec2f(ndc.x * 0.5 + 0.5, 1.0 - (ndc.y * 0.5 + 0.5));
  let depthRef = ndc.z * 0.5 + 0.5 - 0.0025;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 || depthRef > 1.0) {
    return 1.0;
  }
  let texel = 1.0 / vec2f(textureDimensions(shadowMap, 0));
  var sum = 0.0;
  for (var x = -1; x <= 1; x = x + 1) {
    for (var y = -1; y <= 1; y = y + 1) {
      let offset = vec2f(f32(x), f32(y)) * texel;
      sum = sum + textureSampleCompareLevel(shadowMap, shadowSampler, uv + offset, depthRef);
    }
  }
  return sum / 9.0;
}

@fragment fn fs_main(in : VertexOutput, @builtin(front_facing) isFront : bool) -> @location(0) vec4f {
  var diffuse = material.diffuse;
  if (HAS_DIFFUSE_MAP) {
    let sampled = textureSample(diffuseTexture, materialSampler, in.uv);
    diffuse = vec4f(diffuse.rgb * srgbToLinear(sampled.rgb), diffuse.a * sampled.a);
  }

  if (ALPHA_MASK && diffuse.a < material.params.y) {
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
    let tbn = mat3x3f(tangent, bitangent, geometricNormal);
    normal = normalize(tbn * tangentNormal);
  }

  // Specular color is resolved here in UNIFORM control flow. WGSL forbids textureSample inside the
  // per-pixel lighting branch below (it depends on nDotL, a non-uniform value), so the map sample is
  // hoisted out. Maps are deferred on wgpu (placeholder bound), so this stays the material specular
  // until texture upload lands.
  var specularColor = material.specular.rgb;
  if (HAS_SPECULAR_MAP) {
    let sampledSpecular = textureSample(specularTexture, materialSampler, in.uv);
    specularColor = specularColor * srgbToLinear(sampledSpecular.rgb);
  }

  var radiance = vec3f(0.0);

  // Directional light: -direction is the surface-to-light vector (light travels along direction).
  // The whole directional contribution (diffuse + specular) is PCF shadow-mapped, mirroring the PBR path;
  // sampleDirectionalShadow returns 1.0 when no shadow map is bound, so an unshadowed scene is unchanged.
  if (frame.lightDirection.w > 0.5) {
    let lightDir = normalize(-frame.lightDirection.xyz);
    let nDotL = max(dot(normal, lightDir), 0.0);
    var direct = diffuse.rgb * nDotL * frame.directionalRadiance.rgb;

    if ((LIGHTING_PHONG || LIGHTING_BLINNPHONG) && nDotL > 0.0) {
      let viewDir = normalize(frame.cameraPosition.xyz - in.worldPosition);
      var specAngle = 0.0;
      if (LIGHTING_PHONG) {
        // Phong: reflection-vector specular.
        let reflectDir = reflect(-lightDir, normal);
        specAngle = max(dot(reflectDir, viewDir), 0.0);
      } else {
        // BlinnPhong: half-vector specular.
        let halfVec = normalize(lightDir + viewDir);
        specAngle = max(dot(normal, halfVec), 0.0);
      }
      let specular = pow(specAngle, max(material.params.x, 1.0));
      direct = direct + specular * specularColor * frame.directionalRadiance.rgb;
    }

    radiance = radiance + direct * sampleDirectionalShadow(in.worldPosition);
  }

  // Ambient term: flat irradiance over the diffuse albedo.
  if (frame.ambientRadiance.w > 0.5) {
    radiance = radiance + diffuse.rgb * frame.ambientRadiance.rgb;
  }

  return vec4f(radiance, diffuse.a * in.objectAlpha);
}
`;

const _scratch = new Float32Array(CLASSIC_UNIFORM_BYTES / 4);
