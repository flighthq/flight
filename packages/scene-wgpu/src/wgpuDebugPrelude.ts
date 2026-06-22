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

// The shared Wgpu debug prelude — the WGSL mirror of scene-gl's glDebugPrelude. One module source for
// every lighting-INDEPENDENT debug/utility pass material (Depth, Normal). WGSL has no preprocessor, so
// a `MODE` const discriminator (DEPTH_MODE / NORMAL_MODE) and a `HAS_NORMAL_MAP` const the pipeline
// compiler folds select the fragment branch and the (future) normal-map path. Both modes output LINEAR
// color with no lighting term, matching the rgba16float scene target, and ignore the Frame light block.
//
// Depth mode reads the perspective-encoded window-space depth from the WGSL `@builtin(position)` z (the
// VertexOutput.clipPosition lane, which after rasterization holds window-space xyzw with z in NDC depth
// space), linearizes it back into eye space using the camera near/far carried in the material uniform,
// then maps that distance across [near, far] to grayscale `vec3(d)`. NOTE: WebGPU NDC depth is the
// [0, 1] convention (unlike GL's [-1, 1]), so the eye-space reconstruction skips GL's `z * 2 - 1`
// remap — this is the one intentional divergence from depthGlMeshMaterialRenderer's shader.
//
// Normal mode visualizes the WORLD-space surface normal (the geometric normal transformed by the normal
// matrix carried into VertexOutput.worldNormal during vs_main), encoded as `n * 0.5 + 0.5`. NOTE: the
// tangent-space normal map is NOT sampled on wgpu yet — like the StandardPbr / unlit wgpu paths, real
// map textures are not uploaded, so `hasNormalMap` stays false, the bind group binds the shared
// placeholder texture, and the WGSL normal-map branch is reserved for when texture upload lands. This
// mirrors the documented map gap on the rest of the wgpu side.

// The feature flags that select a debug variant. `mode` picks the depth vs normal fragment branch;
// `hasNormalMap` enables the sampled tangent-space normal-map perturbation (normal mode only — depth
// ignores it; not yet wired on wgpu, see the prelude note). Distinct keys compile and cache as distinct
// pipelines.
export interface WgpuDebugDefineKey {
  hasNormalMap: boolean;
  mode: 'depth' | 'normal';
}

// A compiled debug pipeline variant — a WgpuMeshPipeline (pipeline + group(2) material layout).
export interface WgpuDebugPipeline extends WgpuMeshPipeline {}

// Ensures (and caches per material reference) the debug Material bind group — a uniform buffer + the
// shared sampler + the placeholder texture — and rewrites its uniform with this surface's params. The
// params vec4 packs near/far (depth mode) and normalScale (normal mode) into one buffer shared by both
// modes; the active mode reads only the lanes it needs. Mirrors scene-gl's bindGlDebugRange /
// bindGlDebugNormalMap collapsed into one upload. Returns the bind group for the caller to set at
// group(2). normalScale is uploaded for the normal mode; depth mode passes it through unused.
export function bindWgpuDebugSurface(
  state: WgpuRenderState,
  pipeline: Readonly<WgpuDebugPipeline>,
  materialKey: object,
  near: number,
  far: number,
  normalScale: number,
): GPUBindGroup {
  const scene = getWgpuSceneRuntime(state);
  let binding: WgpuMaterialBinding | undefined = scene.materialBindGroups.get(materialKey);
  if (binding === undefined) {
    const stateRuntime = getWgpuRenderStateRuntime(state);
    const buffer = state.device.createBuffer({
      size: DEBUG_UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const bindGroup = state.device.createBindGroup({
      layout: pipeline.materialBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer } },
        { binding: 1, resource: stateRuntime.linearSampler },
        { binding: 2, resource: ensureWgpuPlaceholderTextureView(state) },
      ],
    });
    binding = { bindGroup, buffer };
    scene.materialBindGroups.set(materialKey, binding);
  }

  _scratch[0] = near;
  _scratch[1] = far;
  _scratch[2] = normalScale;
  _scratch[3] = 0;
  state.device.queue.writeBuffer(binding.buffer, 0, _scratch.buffer, 0, DEBUG_UNIFORM_BYTES);
  return binding.bindGroup;
}

// A short, stable, order-independent string identity for a debug define key, used as the pipeline-cache
// key (combined with the color format). Two keys with the same flags produce the same string and so
// share a compiled pipeline. `d-` is depth; `n-` is normal; `nm` is normal + normal map.
export function buildWgpuDebugDefineKey(key: Readonly<WgpuDebugDefineKey>): string {
  return `${key.mode === 'depth' ? 'd' : 'n'}${key.hasNormalMap ? 'm' : '-'}`;
}

// Compiles the debug module for a define key and builds the render pipeline for the given color format,
// with the group(2) material bind-group layout (uniform + sampler + one texture, matching the unlit
// material layout so the shared placeholder satisfies the texture slot). Pure GPU work — no caching —
// used by ensureWgpuDebugPipeline.
export function compileWgpuDebugPipeline(
  state: WgpuRenderState,
  key: Readonly<WgpuDebugDefineKey>,
  format: GPUTextureFormat,
): WgpuDebugPipeline {
  const device = state.device;
  const module = device.createShaderModule({ code: getWgpuDebugModuleSourceForKey(key) });
  const materialBindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
    ],
  });
  // Debug materials are single-sided in OpenFL parity terms; the scene back-face cull is fine for both
  // depth and normal visualization (a culled back face contributes neither depth nor normal).
  return createWgpuMeshPipeline(state, { doubleSided: false, format, materialBindGroupLayout, module });
}

// Resolves the debug pipeline for a define key + color format, compiling and caching it on first use
// through the shared scene pipeline cache under the `debug:` family namespace. Distinct modes (and the
// normal-map variant) cache as distinct entries.
export function ensureWgpuDebugPipeline(
  state: WgpuRenderState,
  key: Readonly<WgpuDebugDefineKey>,
  format: GPUTextureFormat,
): WgpuDebugPipeline {
  return ensureWgpuScenePipeline(state, `debug:${format}|${buildWgpuDebugDefineKey(key)}`, () =>
    compileWgpuDebugPipeline(state, key, format),
  );
}

// The full WGSL module source for a define key: the const-flag block (MODE discriminator + normal-map
// flag) + the shared mesh prelude (Frame/Draw/vs_main/srgbToLinear) + the debug material block +
// fs_main.
export function getWgpuDebugModuleSourceForKey(key: Readonly<WgpuDebugDefineKey>): string {
  return (
    `const MODE : i32 = ${key.mode === 'depth' ? 'DEPTH_MODE' : 'NORMAL_MODE'};\n` +
    `const HAS_NORMAL_MAP : bool = ${key.hasNormalMap ? 'true' : 'false'};\n` +
    DEBUG_MODE_CONSTS_WGSL +
    WGPU_MESH_PRELUDE_WGSL +
    DEBUG_WGSL_BODY
  );
}

// Debug material uniform: params vec4f (16) = 16 bytes / 4 floats. params.x = near, params.y = far
// (depth mode); params.z = normalScale (normal mode, reserved for the future normal-map path).
const DEBUG_UNIFORM_BYTES = 16;

// The two mode discriminator values, declared as consts so the MODE const set by the module header
// reads as a named branch in the fragment body (WGSL has no preprocessor #define).
const DEBUG_MODE_CONSTS_WGSL = /* wgsl */ `
const DEPTH_MODE : i32 = 0;
const NORMAL_MODE : i32 = 1;
`;

const DEBUG_WGSL_BODY = /* wgsl */ `
struct DebugMaterial {
  params : vec4f,  // x = near, y = far (depth); z = normalScale (normal)
};

@group(2) @binding(0) var<uniform> material : DebugMaterial;
@group(2) @binding(1) var materialSampler : sampler;
@group(2) @binding(2) var normalTexture : texture_2d<f32>;

@fragment fn fs_main(in : VertexOutput, @builtin(front_facing) frontFacing : bool) -> @location(0) vec4f {
  if (MODE == DEPTH_MODE) {
    // Linear view-space distance is the perspective w: in.clipPosition is the @builtin(position), whose
    // .w in the fragment stage is 1 / w_clip, so 1 / in.clipPosition.w == w_clip == eye distance. This
    // is camera-agnostic (no camera near/far needed); map it across the material's [near, far]
    // visualization window to grayscale [0, 1].
    let near = material.params.x;
    let far = material.params.y;
    let eyeDepth = 1.0 / in.clipPosition.w;
    let d = clamp((eyeDepth - near) / max(far - near, 1e-6), 0.0, 1.0);
    return vec4f(vec3f(d), 1.0);
  }

  // NORMAL_MODE: visualize the WORLD-space surface normal — the geometric normal carried through
  // draw.normalMatrix in vs_main. The normal-map branch is gated by HAS_NORMAL_MAP but stays inert on
  // wgpu until map upload lands (see the prelude note); normalScale is read so the binding is live.
  var geometricNormal = normalize(in.worldNormal);
  if (!frontFacing) {
    geometricNormal = -geometricNormal;
  }

  var normal = geometricNormal;
  if (HAS_NORMAL_MAP) {
    let tangent = normalize(in.worldTangent.xyz);
    let bitangent = cross(geometricNormal, tangent) * in.worldTangent.w;
    var tangentNormal = textureSample(normalTexture, materialSampler, in.uv).xyz * 2.0 - 1.0;
    tangentNormal = vec3f(tangentNormal.xy * material.params.z, tangentNormal.z);
    let tbn = mat3x3f(tangent, bitangent, geometricNormal);
    normal = normalize(tbn * tangentNormal);
  }

  return vec4f(normal * 0.5 + 0.5, 1.0);
}
`;

const _scratch = new Float32Array(DEBUG_UNIFORM_BYTES / 4);
