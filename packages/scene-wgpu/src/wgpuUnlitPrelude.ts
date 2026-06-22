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

// The shared Wgpu unlit prelude — the WGSL mirror of scene-gl's glUnlitPrelude. One module for every
// lighting-independent flat-color material (Unlit, Emissive, VertexColor): all output LINEAR color with
// no lighting term, scaled by an intensity (1 for Unlit/VertexColor, emissiveStrength for Emissive;
// values > 1 drive bloom over the rgba16float scene target). WGSL has no preprocessor, so each feature
// flag is a `const … : bool` the pipeline compiler folds. The CPU passes the surface color already
// decoded to linear (unpackColorToLinear), so the shader only sRgb-decodes a sampled color map.
//
// NOTE ON MAPS / color0: like the StandardPbr wgpu path, real map textures are not yet sampled on wgpu
// (hasColorMap stays false; the bind group binds the shared placeholder), and VertexColor renders its
// tint without the mesh color0 attribute (the canonical 48-byte vertex layout has no color0 slot and no
// builder emits it). Both mirror documented gaps on the GL side and land when texture upload / color0
// vertex support arrives.

// The feature flags that select an unlit variant. `hasColorMap` enables the sampled color map (not yet
// used on wgpu — see note); `alphaMaskEnabled` enables the alpha-cutoff discard for 'mask' materials;
// `doubleSided` selects the cull-none pipeline.
export interface WgpuUnlitDefineKey {
  alphaMaskEnabled: boolean;
  doubleSided: boolean;
  hasColorMap: boolean;
}

// A compiled unlit pipeline variant — a WgpuMeshPipeline (pipeline + group(2) material layout).
export interface WgpuUnlitPipeline extends WgpuMeshPipeline {}

// Ensures (and caches per material reference) the unlit Material bind group — a uniform buffer + the
// shared sampler + the placeholder color texture — and rewrites its uniform with this surface's linear
// color, intensity, and alpha cutoff. Mirrors scene-gl's bindGlUnlitSurface. Returns the bind group for
// the caller to set at group(2).
export function bindWgpuUnlitSurface(
  state: WgpuRenderState,
  pipeline: Readonly<WgpuUnlitPipeline>,
  materialKey: object,
  color: Readonly<LinearColor>,
  intensity: number,
  alphaCutoff: number,
): GPUBindGroup {
  const scene = getWgpuSceneRuntime(state);
  let binding: WgpuMaterialBinding | undefined = scene.materialBindGroups.get(materialKey);
  if (binding === undefined) {
    const stateRuntime = getWgpuRenderStateRuntime(state);
    const buffer = state.device.createBuffer({
      size: UNLIT_UNIFORM_BYTES,
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

  _scratch[0] = color[0];
  _scratch[1] = color[1];
  _scratch[2] = color[2];
  _scratch[3] = color[3];
  _scratch[4] = intensity;
  _scratch[5] = alphaCutoff;
  _scratch[6] = 0;
  _scratch[7] = 0;
  state.device.queue.writeBuffer(binding.buffer, 0, _scratch.buffer, 0, UNLIT_UNIFORM_BYTES);
  return binding.bindGroup;
}

// A short, stable, order-independent string identity for an unlit define key, used as the pipeline-
// cache key (combined with the color format). Two keys with the same flags share a compiled pipeline.
export function buildWgpuUnlitDefineKey(key: Readonly<WgpuUnlitDefineKey>): string {
  return `${key.alphaMaskEnabled ? 'm' : '-'}${key.doubleSided ? 'd' : '-'}${key.hasColorMap ? 'c' : '-'}`;
}

// Compiles the unlit module for a define key and builds the render pipeline for the given color format,
// with the group(2) material bind-group layout (uniform + sampler + one color texture). Pure GPU work —
// no caching — used by ensureWgpuUnlitPipeline.
export function compileWgpuUnlitPipeline(
  state: WgpuRenderState,
  key: Readonly<WgpuUnlitDefineKey>,
  format: GPUTextureFormat,
): WgpuUnlitPipeline {
  const device = state.device;
  const module = device.createShaderModule({ code: getWgpuUnlitModuleSourceForKey(key) });
  const materialBindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
    ],
  });
  return createWgpuMeshPipeline(state, { doubleSided: key.doubleSided, format, materialBindGroupLayout, module });
}

// Resolves the unlit pipeline for a define key + color format, compiling and caching it on first use
// through the shared scene pipeline cache under the `unlit:` family namespace.
export function ensureWgpuUnlitPipeline(
  state: WgpuRenderState,
  key: Readonly<WgpuUnlitDefineKey>,
  format: GPUTextureFormat,
): WgpuUnlitPipeline {
  return ensureWgpuScenePipeline(state, `unlit:${format}|${buildWgpuUnlitDefineKey(key)}`, () =>
    compileWgpuUnlitPipeline(state, key, format),
  );
}

// The full WGSL module source for a define key: the const-flag block + the shared mesh prelude (Frame/
// Draw/vs_main/srgbToLinear) + the unlit material block + fs_main.
export function getWgpuUnlitModuleSourceForKey(key: Readonly<WgpuUnlitDefineKey>): string {
  return (
    `const ALPHA_MASK : bool = ${key.alphaMaskEnabled ? 'true' : 'false'};\n` +
    `const HAS_COLOR_MAP : bool = ${key.hasColorMap ? 'true' : 'false'};\n` +
    WGPU_MESH_PRELUDE_WGSL +
    UNLIT_WGSL_BODY
  );
}

// Unlit material uniform: color vec4f (16) + params vec4f (16) = 32 bytes / 8 floats. params.x =
// intensity, params.y = alphaCutoff.
const UNLIT_UNIFORM_BYTES = 32;

const UNLIT_WGSL_BODY = /* wgsl */ `
struct UnlitMaterial {
  color : vec4f,   // linear rgba
  params : vec4f,  // x = intensity, y = alphaCutoff
};

@group(2) @binding(0) var<uniform> material : UnlitMaterial;
@group(2) @binding(1) var materialSampler : sampler;
@group(2) @binding(2) var colorTexture : texture_2d<f32>;

@fragment fn fs_main(in : VertexOutput) -> @location(0) vec4f {
  var color = material.color;
  if (HAS_COLOR_MAP) {
    let sampled = textureSample(colorTexture, materialSampler, in.uv);
    color = vec4f(color.rgb * srgbToLinear(sampled.rgb), color.a * sampled.a);
  }
  if (ALPHA_MASK && color.a < material.params.y) {
    discard;
  }
  return vec4f(color.rgb * material.params.x, color.a);
}
`;

const _scratch = new Float32Array(UNLIT_UNIFORM_BYTES / 4);
