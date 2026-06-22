import type { WgpuRenderState } from '@flighthq/types';

import type { WgpuPbrDefineKey } from './webgpuPbrPrelude';
import { buildWgpuPbrDefineKey, getWgpuPbrModuleSourceForKey } from './webgpuPbrPrelude';
import { getWgpuSceneRuntime } from './webgpuSceneRuntime';

// A compiled StandardPbr uber-shader variant plus the bind-group layouts its bind groups target — the
// WGSL mirror of GlPbrProgram. One exists per distinct (define key + color-attachment format) pair: a
// Wgpu render pipeline bakes both the feature flags and its color target format, so an HDR
// rgba16float effect target and the bgra8unorm canvas need separate variants. Built once and cached on
// the WgpuRenderState (see ensureWgpuPbrPipeline). The vertex attribute slots are fixed by the
// pipeline's vertex layout (0 position, 1 normal, 2 tangent, 3 uv0), so they are not stored here.
export interface WgpuPbrPipeline {
  drawBindGroupLayout: GPUBindGroupLayout;
  frameBindGroupLayout: GPUBindGroupLayout;
  materialBindGroupLayout: GPUBindGroupLayout;
  pipeline: GPURenderPipeline;
}

// Compiles the StandardPbr uber-shader module for a define key and builds the render pipeline + its
// bind-group layouts for the given color-attachment format. Pure GPU work — no caching — used by
// ensureWgpuPbrPipeline. Depth-stencil is depth24plus-stencil8 with compare 'less' + depth write on
// (the scene pass owns depth; stencil inert); culling is back-face unless the key is doubleSided.
export function compileWgpuPbrPipeline(
  state: WgpuRenderState,
  key: Readonly<WgpuPbrDefineKey>,
  format: GPUTextureFormat,
): WgpuPbrPipeline {
  const device = state.device;
  const module = device.createShaderModule({ code: getWgpuPbrModuleSourceForKey(key) });

  const frameBindGroupLayout = device.createBindGroupLayout({
    entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }],
  });
  const drawBindGroupLayout = device.createBindGroupLayout({
    entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform', hasDynamicOffset: true } }],
  });
  const materialBindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 5, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 6, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
    ],
  });

  const layout = device.createPipelineLayout({
    bindGroupLayouts: [frameBindGroupLayout, drawBindGroupLayout, materialBindGroupLayout],
  });

  const pipeline = device.createRenderPipeline({
    layout,
    vertex: { module, entryPoint: 'vs_main', buffers: VERTEX_BUFFER_LAYOUTS },
    fragment: { module, entryPoint: 'fs_main', targets: [{ format }] },
    primitive: {
      topology: 'triangle-list',
      frontFace: 'ccw',
      cullMode: key.doubleSided ? 'none' : 'back',
    },
    depthStencil: {
      format: DEPTH_STENCIL_FORMAT,
      depthWriteEnabled: true,
      depthCompare: 'less',
    },
  });

  return { drawBindGroupLayout, frameBindGroupLayout, materialBindGroupLayout, pipeline };
}

// Resolves the StandardPbr pipeline for a define key + color-attachment format, compiling and caching
// it on first use. The cache is the scene-wgpu runtime's pipelineCache (a per-WgpuRenderState Map
// keyed by the define key's stable string + format), so each variant is compiled at most once per
// state and reused every frame.
export function ensureWgpuPbrPipeline(
  state: WgpuRenderState,
  key: Readonly<WgpuPbrDefineKey>,
  format: GPUTextureFormat,
): WgpuPbrPipeline {
  const runtime = getWgpuSceneRuntime(state);
  const cacheKey = `${format}|${buildWgpuPbrDefineKey(key)}`;
  let pipeline = runtime.pipelineCache.get(cacheKey);
  if (pipeline === undefined) {
    pipeline = compileWgpuPbrPipeline(state, key, format);
    runtime.pipelineCache.set(cacheKey, pipeline);
  }
  return pipeline;
}

// The depth-stencil format the scene pass uses, matching render-wgpu's main-canvas / effect-target
// depth attachment (renderWgpuBackground / the effect pipeline create this exact format).
const DEPTH_STENCIL_FORMAT: GPUTextureFormat = 'depth24plus-stencil8';

// The canonical interleaved 48-byte PBR vertex: position(float32x3) @0, normal(float32x3) @12,
// tangent(float32x4) @24, uv0(float32x2) @40. Matches the @location slots in the WGSL vs_main.
const VERTEX_BUFFER_LAYOUTS: GPUVertexBufferLayout[] = [
  {
    arrayStride: 48,
    attributes: [
      { shaderLocation: 0, offset: 0, format: 'float32x3' },
      { shaderLocation: 1, offset: 12, format: 'float32x3' },
      { shaderLocation: 2, offset: 24, format: 'float32x4' },
      { shaderLocation: 3, offset: 40, format: 'float32x2' },
    ],
  },
];
