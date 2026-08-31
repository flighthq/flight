import { getWgpuRenderStateDeviceResources } from '@flighthq/render-wgpu/contract';
import type {
  WgpuDebugDefineKey,
  WgpuDebugPipeline,
  WgpuRenderState,
  WgpuMaterialBinding,
} from '@flighthq/types/contract';

import { WGPU_MESH_FRAGMENT_TAIL } from './wgpuMeshFragmentTail';
import {
  createWgpuMeshPipeline,
  ensureWgpuPlaceholderTextureView,
  ensureWgpuScene3DPipeline,
  stashWgpuUvTransform,
  WGPU_MESH_PRELUDE_WGSL,
} from './wgpuMeshPipeline';
import { getWgpuScene3DRuntime } from './wgpuScene3DRuntime';
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
  const scene = getWgpuScene3DRuntime(state);
  let binding: WgpuMaterialBinding | undefined = scene.materialBindGroups.get(materialKey);
  if (binding === undefined) {
    const buffer = state.device.createBuffer({
      size: DEBUG_UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const bindGroup = state.device.createBindGroup({
      layout: pipeline.materialBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer } },
        { binding: 1, resource: getWgpuRenderStateDeviceResources(state).linearSampler },
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
  // The debug views (depth, normal) sample no uv map, so stash identity to keep the shared Draw uniform
  // authoritative — a prior tiled material's transform must not persist into this bind.
  stashWgpuUvTransform(state, null);
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
  blended = false,
  doubleSided = false,
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
  return createWgpuMeshPipeline(state, { blended, doubleSided, format, materialBindGroupLayout, module });
}

// Resolves the debug pipeline for a define key + color format + cull choice, compiling and caching it
// on first use through the shared scene pipeline cache under the `debug:` family namespace. Distinct
// modes, normal-map variants, and single/double-sided choices cache as distinct entries.
export function ensureWgpuDebugPipeline(
  state: WgpuRenderState,
  key: Readonly<WgpuDebugDefineKey>,
  format: GPUTextureFormat,
  doubleSided = false,
): WgpuDebugPipeline {
  return ensureWgpuScene3DPipeline(
    state,
    `debug:${format}|${buildWgpuDebugDefineKey(key)}|${doubleSided ? 'double' : 'single'}`,
    (blended) => compileWgpuDebugPipeline(state, key, format, blended, doubleSided),
  );
}

// The full WGSL module source for a define key: the const-flag block (MODE discriminator + normal-map
// flag) + the shared mesh prelude (Frame/Draw/vs_main) + the debug material block +
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

const DEBUG_WGSL_BODY = /* wgsl */ `${WGPU_MESH_FRAGMENT_TAIL}
struct DebugMaterial {
  params : vec4f,  // x = near, y = far (depth); z = normalScale (normal)
};

@group(2) @binding(0) var<uniform> material : DebugMaterial;
@group(2) @binding(1) var materialSampler : sampler;
@group(2) @binding(2) var normalTexture : texture_2d<f32>;

@fragment fn fs_main(in : VertexOutput, @builtin(front_facing) frontFacing : bool) -> @location(0) vec4f {
  if (MODE == DEPTH_MODE) {
    // Linear view-space distance is the perspective w: in.clipPosition is the @builtin(position), whose
    // .w in the fragment scene2d is 1 / w_clip, so 1 / in.clipPosition.w == w_clip == eye distance. This
    // is camera-agnostic (no camera near/far needed); map it across the material's [near, far]
    // visualization window to grayscale [0, 1].
    let near = material.params.x;
    let far = material.params.y;
    let eyeDepth = 1.0 / in.clipPosition.w;
    let d = clamp((eyeDepth - near) / max(far - near, 1e-6), 0.0, 1.0);
    return flightPremultipliedOutput(vec4f(vec3f(d), flightMeshCoverage(1.0, in.objectAlpha, draw.params.y)));
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

  return flightPremultipliedOutput(vec4f(normal * 0.5 + 0.5, flightMeshCoverage(1.0, in.objectAlpha, draw.params.y)));
}
`;

const _scratch = new Float32Array(DEBUG_UNIFORM_BYTES / 4);
