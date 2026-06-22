import type { WgpuRenderState } from '@flighthq/types';

import type { WgpuMeshPipeline } from './wgpuMeshPipeline';
import { createWgpuMeshPipeline, ensureWgpuScenePipeline } from './wgpuMeshPipeline';
import type { WgpuPbrDefineKey } from './wgpuPbrPrelude';
import { buildWgpuPbrDefineKey, getWgpuPbrModuleSourceForKey } from './wgpuPbrPrelude';

// A compiled PBR uber-shader variant plus the material bind-group layout its group(2) targets — the
// WGSL mirror of GlPbrProgram. One exists per distinct (define key + color-attachment format) pair: a
// Wgpu render pipeline bakes both the feature flags and its color target format, so an HDR rgba16float
// effect target and the bgra8unorm canvas need separate variants. The shared group(0)/group(1) Frame +
// Draw layouts live on the scene runtime (see wgpuMeshPipeline), so only the material layout is carried
// here — inherited from WgpuMeshPipeline. Built once and cached via ensureWgpuPbrPipeline.
export interface WgpuPbrPipeline extends WgpuMeshPipeline {}

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
  return createWgpuMeshPipeline(state, { doubleSided: key.doubleSided, format, materialBindGroupLayout, module });
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
