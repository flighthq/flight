import type { LinearColor } from '@flighthq/materials';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu';
import type { WgpuRenderState } from '@flighthq/types';

import type { WgpuMeshPipeline } from './wgpuMeshPipeline';
import {
  createWgpuMeshPipeline,
  ensureWgpuPlaceholderTextureView,
  ensureWgpuScenePipeline,
  WGPU_MESH_PRELUDE_WGSL,
} from './wgpuMeshPipeline';
import type { WgpuMaterialBinding } from './wgpuSceneRuntime';
import { getWgpuSceneRuntime } from './wgpuSceneRuntime';

// The shared Wgpu classic prelude — the WGSL mirror of scene-gl's glClassicPrelude. One module source
// serves the three classic lit mesh-material families — Lambert (diffuse only), Phong (reflection-
// vector specular), and BlinnPhong (half-vector specular). WGSL has no preprocessor, so the lighting
// model and feature flags are emitted as `const … : bool`/`const LIGHTING_… : bool` ahead of the body
// and the shader branches on them (the pipeline compiler folds the dead branches away). One directional
// + one ambient light are read from the shared Frame uniform (see WGPU_MESH_PRELUDE_WGSL), gated by the
// presence counts, and the fragment stage outputs LINEAR HDR radiance (no tonemap / gamma here — the
// effect pipeline's resolve pass owns that), matching the rgba16float scene target.
//
// The specular models share the Lambert diffuse term and differ only in the specular geometry: Phong
// raises max(dot(reflect(-L, N), V), 0) to the shininess exponent; BlinnPhong raises
// max(dot(N, normalize(L + V)), 0). Both need the world-space view vector, so the camera position
// (frame.cameraPosition) is read for Phong/BlinnPhong. Lambert has no view-dependent term and ignores
// it; its specular branch is compiled out.
//
// NOTE ON MAPS: like the StandardPbr / Unlit wgpu paths, real map textures (diffuse/specular/normal)
// are not yet sampled on wgpu — the `has*Map` flags stay false, the material bind group binds the
// shared 1x1 placeholder texture for each map slot, and only the scalar uniforms (diffuse, specular,
// shininess) drive shading. This mirrors a documented gap (the GL classic path works textured; wgpu
// defers texture upload until the shared map-upload path arrives). The Lambert `emissive` field also
// follows the GL classic, which currently does not add an emissive term — kept for parity, no emissive
// lobe here.

// One classic shading model. Lambert is diffuse-only; Phong and BlinnPhong add a specular lobe that
// differs only in the reflection geometry (reflection vector vs. half vector). The model is encoded
// first into the pipeline-cache key and selects the fragment shader's specular branch via a const flag.
export type WgpuClassicLightingModel = 'blinnphong' | 'lambert' | 'phong';

// A compiled classic pipeline variant — a WgpuMeshPipeline (pipeline + group(2) material layout).
export interface WgpuClassicPipeline extends WgpuMeshPipeline {}

// The feature flags that select a classic uber-shader variant. `lightingModel` chooses the shading
// model (and whether a specular branch exists at all); `hasDiffuseMap` / `hasSpecularMap` /
// `hasNormalMap` enable the textured paths (not yet used on wgpu — see the prelude note);
// `alphaMaskEnabled` enables the alpha-cutoff discard for 'mask' materials; `doubleSided` selects the
// cull-none pipeline and flips the normal toward the viewer on back faces.
export interface WgpuClassicDefineKey {
  alphaMaskEnabled: boolean;
  doubleSided: boolean;
  hasDiffuseMap: boolean;
  hasNormalMap: boolean;
  hasSpecularMap: boolean;
  lightingModel: WgpuClassicLightingModel;
}

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
): GPUBindGroup {
  const scene = getWgpuSceneRuntime(state);
  let binding: WgpuMaterialBinding | undefined = scene.materialBindGroups.get(materialKey);
  if (binding === undefined) {
    const stateRuntime = getWgpuRenderStateRuntime(state);
    const buffer = state.device.createBuffer({
      size: CLASSIC_UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const placeholder = ensureWgpuPlaceholderTextureView(state);
    const bindGroup = state.device.createBindGroup({
      layout: pipeline.materialBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer } },
        { binding: 1, resource: stateRuntime.linearSampler },
        { binding: 2, resource: placeholder },
        { binding: 3, resource: placeholder },
        { binding: 4, resource: placeholder },
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
  return createWgpuMeshPipeline(state, { doubleSided: key.doubleSided, format, materialBindGroupLayout, module });
}

// Resolves the classic pipeline for a define key + color format, compiling and caching it on first use
// through the shared scene pipeline cache under the `classic:` family namespace, so each model +
// feature/format variant is compiled at most once per state and reused every frame.
export function ensureWgpuClassicPipeline(
  state: WgpuRenderState,
  key: Readonly<WgpuClassicDefineKey>,
  format: GPUTextureFormat,
): WgpuClassicPipeline {
  return ensureWgpuScenePipeline(state, `classic:${format}|${buildWgpuClassicDefineKey(key)}`, () =>
    compileWgpuClassicPipeline(state, key, format),
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

  var radiance = vec3f(0.0);

  // Directional light: -direction is the surface-to-light vector (light travels along direction).
  if (frame.lightDirection.w > 0.5) {
    let lightDir = normalize(-frame.lightDirection.xyz);
    let nDotL = max(dot(normal, lightDir), 0.0);
    radiance = radiance + diffuse.rgb * nDotL * frame.directionalRadiance.rgb;

    if ((LIGHTING_PHONG || LIGHTING_BLINNPHONG) && nDotL > 0.0) {
      let viewDir = normalize(frame.cameraPosition.xyz - in.worldPosition);
      var specularColor = material.specular.rgb;
      if (HAS_SPECULAR_MAP) {
        let sampledSpecular = textureSample(specularTexture, materialSampler, in.uv);
        specularColor = specularColor * srgbToLinear(sampledSpecular.rgb);
      }
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
      radiance = radiance + specular * specularColor * frame.directionalRadiance.rgb;
    }
  }

  // Ambient term: flat irradiance over the diffuse albedo.
  if (frame.ambientRadiance.w > 0.5) {
    radiance = radiance + diffuse.rgb * frame.ambientRadiance.rgb;
  }

  return vec4f(radiance, diffuse.a);
}
`;

const _scratch = new Float32Array(CLASSIC_UNIFORM_BYTES / 4);
