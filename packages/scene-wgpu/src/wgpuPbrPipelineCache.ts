import type { WgpuPbrPipeline, WgpuRenderState, WgpuPbrDefineKey } from '@flighthq/types';

import { createWgpuMeshPipeline, ensureWgpuPbrSampleLayout, ensureWgpuScenePipeline } from './wgpuMeshPipeline';
import { buildWgpuPbrDefineKey, getWgpuPbrModuleSourceForKey } from './wgpuPbrPrelude';
// Compiles the PBR uber-shader module for a define key and builds the render pipeline for the given
// color-attachment format. Pure GPU work — no caching — used by ensureWgpuPbrPipeline. The group(2)
// material layout is a uniform (the MaterialBlock) + a filtering sampler + the five standard map
// textures, so the layout matches whether or not the variant samples maps (maps deferred on wgpu).
// Depth-stencil, vertex layout, and back-face culling (unless doubleSided) come from the shared
// createWgpuMeshPipeline. Mirrors scene-gl's compileGlPbrProgram.
export function compileWgpuPbrPipeline(
  state: WgpuRenderState,
  key: Readonly<WgpuPbrDefineKey>,
  format: GPUTextureFormat,
): WgpuPbrPipeline {
  const device = state.device;
  const module = device.createShaderModule({ code: getWgpuPbrModuleSourceForKey(key) });
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
  // The PBR family is lit and may PCF-sample shadows plus image-based lighting. Both live in one group
  // 3 layout so the pipeline fits WebGPU's required maxBindGroups minimum of 4.
  return createWgpuMeshPipeline(state, {
    doubleSided: key.doubleSided,
    format,
    materialBindGroupLayout,
    module,
    pbrSampleBindGroupLayout: ensureWgpuPbrSampleLayout(state),
  });
}

// Resolves the PBR pipeline for a define key + color-attachment format, compiling and caching it on
// first use through the shared scene pipeline cache under the `pbr:` family namespace, so each variant
// is compiled at most once per state and reused every frame. Mirrors scene-gl's ensureGlPbrProgram.
export function ensureWgpuPbrPipeline(
  state: WgpuRenderState,
  key: Readonly<WgpuPbrDefineKey>,
  format: GPUTextureFormat,
): WgpuPbrPipeline {
  return ensureWgpuScenePipeline(state, `pbr:${format}|${buildWgpuPbrDefineKey(key)}`, () =>
    compileWgpuPbrPipeline(state, key, format),
  );
}
