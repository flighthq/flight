import { getWgpuColorAdjustmentMaterialFeature } from '@flighthq/render-wgpu/contract';
import type {
  WgpuColorAdjustmentMaterialFeature,
  WgpuPbrPipeline,
  WgpuRenderState,
  WgpuPbrDefineKey,
} from '@flighthq/types/contract';

import { createWgpuMeshPipeline, ensureWgpuPbrSampleLayout, ensureWgpuScene3DPipeline } from './wgpuMeshPipeline';
import { buildWgpuPbrDefineKey, getWgpuPbrModuleSourceForKey } from './wgpuPbrPrelude';
import { getWgpuSkinningAdapter } from './wgpuScene3DRuntime';
import { getWgpuScene3DRuntime } from './wgpuScene3DRuntime';
// Compiles the PBR uber-shader module for a define key and builds the render pipeline for the given
// color-attachment format. Pure GPU work — no caching — used by ensureWgpuPbrPipeline. The group(2)
// material layout is a uniform (the MaterialBlock) + one filtering sampler per standard map + six
// textures (base-color, normal, metallic-roughness, occlusion, emissive, alpha), which are all
// sampled from real uploads when present; an absent map binds a shared placeholder view, so the
// layout is fixed whether or not a given variant samples a particular map.
// Depth-stencil, vertex layout, and back-face culling (unless doubleSided) come from the shared
// createWgpuMeshPipeline. Mirrors scene-gl's compileGlPbrProgram.
export function compileWgpuPbrPipeline(
  state: WgpuRenderState,
  key: Readonly<WgpuPbrDefineKey>,
  format: GPUTextureFormat,
  blended = false,
  skinned = false,
  colorAdjustmentFeature: Readonly<WgpuColorAdjustmentMaterialFeature> | null = null,
): WgpuPbrPipeline {
  const device = state.device;
  const module = device.createShaderModule({
    code: getWgpuPbrModuleSourceForKey(key, skinned, getWgpuSkinningAdapter(state), colorAdjustmentFeature),
  });
  const materialBindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      { binding: 4, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      { binding: 5, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      { binding: 6, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      { binding: 7, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 8, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 9, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 10, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 11, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 12, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
    ],
  });
  // The PBR family is lit and may PCF-sample shadows plus image-based lighting. Both live in one group
  // 3 layout so the pipeline fits WebGPU's required maxBindGroups minimum of 4.
  return createWgpuMeshPipeline(state, {
    blended,
    doubleSided: key.doubleSided,
    format,
    materialBindGroupLayout,
    module,
    pbrSampleBindGroupLayout: ensureWgpuPbrSampleLayout(state),
    skinned,
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
  const fullKey: WgpuPbrDefineKey = {
    ...key,
    hasColorAdjustment: getWgpuScene3DRuntime(state).activeColorAdjustmentRun,
    hasColorMatrix: getWgpuScene3DRuntime(state).activeColorMatrixRun,
  };
  return ensureWgpuScene3DPipeline(state, `pbr:${format}|${buildWgpuPbrDefineKey(fullKey)}`, (blended, skinned) =>
    compileWgpuPbrPipeline(state, fullKey, format, blended, skinned, getWgpuColorAdjustmentMaterialFeature(state)),
  );
}
