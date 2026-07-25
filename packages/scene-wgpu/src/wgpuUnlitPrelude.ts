import { bindWgpuVideoTexture } from '@flighthq/render-wgpu';
import type {
  LinearColor,
  Texture,
  VideoTexture,
  WgpuMaterialBinding,
  WgpuRenderState,
  WgpuUnlitDefineKey,
  WgpuUnlitPipeline,
} from '@flighthq/types';
import type { WgpuSkinningAdapter } from '@flighthq/types';

import {
  createWgpuMeshPipeline,
  ensureWgpuScenePipeline,
  getWgpuMeshPreludeWgsl,
  getWgpuMaterialSampler,
  ensureWgpuPlaceholderTextureView,
  resolveWgpuMaterialTextureView,
  stashWgpuUvTransform,
} from './wgpuMeshPipeline';
import { getWgpuSceneRuntime, getWgpuSkinningAdapter } from './wgpuSceneRuntime';
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
  colorMap: Readonly<Texture> | null,
): GPUBindGroup {
  const sampler = getWgpuMaterialSampler(state, colorMap);
  const view = resolveWgpuMaterialTextureView(state, colorMap);
  const binding = ensureWgpuUnlitBinding(state, pipeline, materialKey, sampler, view);
  writeWgpuUnlitUniform(state, binding, color, intensity, alphaCutoff);
  stashWgpuUvTransform(state, colorMap);
  return binding.bindGroup;
}

// Dynamic-video sibling of bindWgpuUnlitSurface. The VideoTexture uploader preserves one GPU texture
// per stream, copies only when frameId advances, and replaces the material bind group when a resolution
// change yields a new view. It shares the still-image shader/layout and UV-transform path.
export function bindWgpuUnlitVideoSurface(
  state: WgpuRenderState,
  pipeline: Readonly<WgpuUnlitPipeline>,
  materialKey: object,
  color: Readonly<LinearColor>,
  intensity: number,
  alphaCutoff: number,
  colorMap: Readonly<VideoTexture>,
): GPUBindGroup {
  const entry = bindWgpuVideoTexture(state, colorMap);
  const sampler = getWgpuMaterialSampler(state, colorMap);
  const view = entry?.view ?? ensureWgpuPlaceholderTextureView(state);
  const binding = ensureWgpuUnlitBinding(state, pipeline, materialKey, sampler, view);
  writeWgpuUnlitUniform(state, binding, color, intensity, alphaCutoff);
  stashWgpuUvTransform(state, colorMap);
  return binding.bindGroup;
}

function ensureWgpuUnlitBinding(
  state: WgpuRenderState,
  pipeline: Readonly<WgpuUnlitPipeline>,
  materialKey: object,
  sampler: GPUSampler,
  view: GPUTextureView,
): WgpuMaterialBinding {
  const scene = getWgpuSceneRuntime(state);
  let binding = scene.materialBindGroups.get(materialKey);
  if (binding === undefined) {
    const buffer = state.device.createBuffer({
      size: UNLIT_UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    binding = {
      bindGroup: createWgpuUnlitBindGroup(state, pipeline, buffer, sampler, view),
      buffer,
      sampler,
      views: [view],
    };
    scene.materialBindGroups.set(materialKey, binding);
  } else if (binding.sampler !== sampler || binding.views?.[0] !== view || (binding.views?.length ?? 0) !== 1) {
    binding.bindGroup = createWgpuUnlitBindGroup(state, pipeline, binding.buffer, sampler, view);
    binding.sampler = sampler;
    binding.views ??= [view];
    binding.views[0] = view;
    binding.views.length = 1;
  }
  return binding;
}

function createWgpuUnlitBindGroup(
  state: WgpuRenderState,
  pipeline: Readonly<WgpuUnlitPipeline>,
  buffer: GPUBuffer,
  sampler: GPUSampler,
  view: GPUTextureView,
): GPUBindGroup {
  return state.device.createBindGroup({
    layout: pipeline.materialBindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer } },
      { binding: 1, resource: sampler },
      { binding: 2, resource: view },
    ],
  });
}

function writeWgpuUnlitUniform(
  state: WgpuRenderState,
  binding: Readonly<WgpuMaterialBinding>,
  color: Readonly<LinearColor>,
  intensity: number,
  alphaCutoff: number,
): void {
  _scratch[0] = color[0];
  _scratch[1] = color[1];
  _scratch[2] = color[2];
  _scratch[3] = color[3];
  _scratch[4] = intensity;
  _scratch[5] = alphaCutoff;
  _scratch[6] = 0;
  _scratch[7] = 0;
  state.device.queue.writeBuffer(binding.buffer, 0, _scratch.buffer, 0, UNLIT_UNIFORM_BYTES);
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
  blended = false,
  skinned = false,
): WgpuUnlitPipeline {
  const device = state.device;
  const module = device.createShaderModule({
    code: getWgpuUnlitModuleSourceForKey(key, skinned, getWgpuSkinningAdapter(state)),
  });
  const materialBindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
    ],
  });
  return createWgpuMeshPipeline(state, {
    blended,
    doubleSided: key.doubleSided,
    format,
    materialBindGroupLayout,
    module,
    skinned,
  });
}

// Resolves the unlit pipeline for a define key + color format, compiling and caching it on first use
// through the shared scene pipeline cache under the `unlit:` family namespace.
export function ensureWgpuUnlitPipeline(
  state: WgpuRenderState,
  key: Readonly<WgpuUnlitDefineKey>,
  format: GPUTextureFormat,
): WgpuUnlitPipeline {
  return ensureWgpuScenePipeline(state, `unlit:${format}|${buildWgpuUnlitDefineKey(key)}`, (blended, skinned) =>
    compileWgpuUnlitPipeline(state, key, format, blended, skinned),
  );
}

// The full WGSL module source for a define key: the const-flag block + the shared mesh prelude (Frame/
// Draw/vs_main/srgbToLinear) + the unlit material block + fs_main.
export function getWgpuUnlitModuleSourceForKey(
  key: Readonly<WgpuUnlitDefineKey>,
  skinned = false,
  skinning: Readonly<WgpuSkinningAdapter> | null = null,
): string {
  return (
    `const ALPHA_MASK : bool = ${key.alphaMaskEnabled ? 'true' : 'false'};\n` +
    `const HAS_COLOR_MAP : bool = ${key.hasColorMap ? 'true' : 'false'};\n` +
    getWgpuMeshPreludeWgsl(skinned, skinning) +
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
  return vec4f(color.rgb * material.params.x, color.a * in.objectAlpha);
}
`;

const _scratch = new Float32Array(UNLIT_UNIFORM_BYTES / 4);
