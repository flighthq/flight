import { getWgpuRenderStateDeviceResources } from '@flighthq/render-wgpu/contract';
import type {
  WgpuToonDefineKey,
  WgpuToonPipeline,
  WgpuRenderState,
  WgpuMaterialBinding,
} from '@flighthq/types/contract';
import type { WgpuSkinningAdapter } from '@flighthq/types/contract';

import { WGPU_MESH_FRAGMENT_TAIL } from './wgpuMeshFragmentTail';
import {
  createWgpuMeshPipeline,
  ensureWgpuPlaceholderTextureView,
  ensureWgpuScene3DPipeline,
  ensureWgpuShadowSampleLayout,
  getWgpuMeshPreludeWgsl,
  stashWgpuUvTransform,
  WGPU_DIRECTIONAL_SHADOW_WGSL,
} from './wgpuMeshPipeline';
import { getWgpuSkinningAdapter } from './wgpuScene3DRuntime';
import { getWgpuScene3DRuntime } from './wgpuScene3DRuntime';
// Ensures (and caches per material reference) the Toon Material bind group — a uniform buffer + the
// shared sampler + the placeholder base-color and ramp textures — and rewrites its uniform with this
// surface's linear base color, step count, and alpha cutoff. Mirrors scene-gl's bindGlToonMaterialUniforms
// + the wgpu unlit/pbr bind helpers. Returns the bind group for the caller to set at group(2). Maps are
// not sampled yet, so both texture slots bind the shared placeholder (see the prelude maps note).
export function bindWgpuToonSurface(
  state: WgpuRenderState,
  pipeline: Readonly<WgpuToonPipeline>,
  materialKey: object,
  baseColor: Readonly<[number, number, number, number]>,
  steps: number,
  alphaCutoff: number,
): GPUBindGroup {
  const scene = getWgpuScene3DRuntime(state);
  let binding: WgpuMaterialBinding | undefined = scene.materialBindGroups.get(materialKey);
  if (binding === undefined) {
    const buffer = state.device.createBuffer({
      size: TOON_UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const placeholder = ensureWgpuPlaceholderTextureView(state);
    const bindGroup = state.device.createBindGroup({
      layout: pipeline.materialBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer } },
        { binding: 1, resource: getWgpuRenderStateDeviceResources(state).linearSampler },
        { binding: 2, resource: placeholder },
        { binding: 3, resource: placeholder },
      ],
    });
    binding = { bindGroup, buffer };
    scene.materialBindGroups.set(materialKey, binding);
  }

  _scratch[0] = baseColor[0];
  _scratch[1] = baseColor[1];
  _scratch[2] = baseColor[2];
  _scratch[3] = baseColor[3];
  _scratch[4] = steps;
  _scratch[5] = alphaCutoff;
  _scratch[6] = 0;
  _scratch[7] = 0;
  state.device.queue.writeBuffer(binding.buffer, 0, _scratch.buffer, 0, TOON_UNIFORM_BYTES);
  // Toon does not yet sample its base-color map, so stash identity to keep the shared Draw uniform
  // authoritative — a prior tiled material's transform must not persist into this bind.
  stashWgpuUvTransform(state, null);
  return binding.bindGroup;
}

// A short, stable, order-independent string identity for a Toon define key, used as the pipeline-cache
// key (combined with the color format). Two keys with the same flags share a compiled pipeline.
export function buildWgpuToonDefineKey(key: Readonly<WgpuToonDefineKey>): string {
  return `${key.alphaMaskEnabled ? 'm' : '-'}${key.doubleSided ? 'd' : '-'}${key.hasBaseColorMap ? 'b' : '-'}${
    key.hasRamp ? 'r' : '-'
  }`;
}

// Compiles the Toon module for a define key and builds the render pipeline for the given color format,
// with the group(2) material bind-group layout (uniform + sampler + base-color + ramp textures). Pure
// GPU work — no caching — used by ensureWgpuToonPipeline.
export function compileWgpuToonPipeline(
  state: WgpuRenderState,
  key: Readonly<WgpuToonDefineKey>,
  format: GPUTextureFormat,
  blended = false,
  skinned = false,
): WgpuToonPipeline {
  const device = state.device;
  const module = device.createShaderModule({
    code: getWgpuToonModuleSourceForKey(key, skinned, getWgpuSkinningAdapter(state)),
  });
  const materialBindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
    ],
  });
  // group(3) shadow-sample layout opts the toon pipeline into directional shadow reception; the shared
  // shadow group is bound each draw by beginWgpuMeshDraw (real depth map or a gated-off 1x1 dummy).
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

// Resolves the Toon pipeline for a define key + color format, compiling and caching it on first use
// through the shared scene pipeline cache under the `toon:` family namespace.
export function ensureWgpuToonPipeline(
  state: WgpuRenderState,
  key: Readonly<WgpuToonDefineKey>,
  format: GPUTextureFormat,
): WgpuToonPipeline {
  return ensureWgpuScene3DPipeline(state, `toon:${format}|${buildWgpuToonDefineKey(key)}`, (blended, skinned) =>
    compileWgpuToonPipeline(state, key, format, blended, skinned),
  );
}

// The full WGSL module source for a define key: the const-flag block + the shared mesh prelude (Frame/
// Draw/vs_main) + the Toon material block + fs_main.
export function getWgpuToonModuleSourceForKey(
  key: Readonly<WgpuToonDefineKey>,
  skinned = false,
  skinning: Readonly<WgpuSkinningAdapter> | null = null,
): string {
  return (
    `const ALPHA_MASK : bool = ${key.alphaMaskEnabled ? 'true' : 'false'};\n` +
    `const DOUBLE_SIDED : bool = ${key.doubleSided ? 'true' : 'false'};\n` +
    `const HAS_BASE_COLOR_MAP : bool = ${key.hasBaseColorMap ? 'true' : 'false'};\n` +
    `const HAS_RAMP : bool = ${key.hasRamp ? 'true' : 'false'};\n` +
    getWgpuMeshPreludeWgsl(skinned, skinning) +
    TOON_WGSL_BODY
  );
}

// Toon material uniform: baseColor vec4f (16) + params vec4f (16) = 32 bytes / 8 floats. params.x =
// steps (band count for the stepped-floor quantizer), params.y = alphaCutoff.
const TOON_UNIFORM_BYTES = 32;

const TOON_WGSL_BODY = /* wgsl */ `${WGPU_MESH_FRAGMENT_TAIL}
struct ToonMaterial {
  baseColor : vec4f,  // linear rgba
  params : vec4f,     // x = steps, y = alphaCutoff
};

@group(2) @binding(0) var<uniform> material : ToonMaterial;
@group(2) @binding(1) var materialSampler : sampler;
@group(2) @binding(2) var baseColorTexture : texture_2d<f32>;
@group(2) @binding(3) var rampTexture : texture_2d<f32>;

${WGPU_DIRECTIONAL_SHADOW_WGSL}

@fragment fn fs_main(in : VertexOutput, @builtin(front_facing) isFront : bool) -> @location(0) vec4f {
  var baseColor = material.baseColor;
  if (HAS_BASE_COLOR_MAP) {
    let sampled = textureSample(baseColorTexture, materialSampler, in.uv);
    baseColor = vec4f(baseColor.rgb * sampled.rgb, baseColor.a * sampled.a);
  }

  if (ALPHA_MASK && baseColor.a < material.params.y) {
    discard;
  }
  if (ALPHA_MASK) {
    baseColor.a = 1.0;
  }

  var normal = normalize(in.worldNormal);
  // Double-sided materials flip the normal for back faces so both sides shade correctly.
  if (DOUBLE_SIDED && !isFront) {
    normal = -normal;
  }

  var radiance = vec3f(0.0);

  // Directional light: -direction is the surface-to-light vector (light travels along direction). The
  // raw N·L is quantized into cel bands — a 1D ramp lookup when bound, else a stepped floor over steps —
  // then scales the base color and the directional radiance. The banded contribution is shadow-mapped
  // like the classic/PBR directional term; sampleDirectionalShadow is 1.0 when no map is bound.
  if (frame.lightDirection.w > 0.5) {
    let lightDir = normalize(-frame.lightDirection.xyz);
    let nDotL = clamp(dot(normal, lightDir), 0.0, 1.0);
    var direct = vec3f(0.0);
    if (HAS_RAMP) {
      let band = textureSample(rampTexture, materialSampler, vec2f(nDotL, 0.5)).rgb;
      direct = baseColor.rgb * band * frame.directionalRadiance.rgb;
    } else {
      let steps = material.params.x;
      let band = floor(nDotL * steps) / max(steps, 1.0);
      direct = baseColor.rgb * band * frame.directionalRadiance.rgb;
    }
    radiance = radiance + direct * sampleDirectionalShadow(in.worldPosition, normal);
  }

  // Ambient term: flat irradiance over the base color (unbanded).
  if (frame.ambientRadiance.w > 0.5) {
    radiance = radiance + baseColor.rgb * frame.ambientRadiance.rgb;
  }

  return flightPremultipliedOutput(vec4f(radiance, flightMeshCoverage(baseColor.a, in.objectAlpha, draw.params.y)));
}
`;

const _scratch = new Float32Array(TOON_UNIFORM_BYTES / 4);
