import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu';
import type {
  Camera3D,
  ClearcoatPbrMaterial,
  Material,
  MeshGeometry,
  SceneLightBlock,
  SceneRenderProxy,
  WgpuMeshMaterialRenderer,
  WgpuRenderState,
} from '@flighthq/types';
import { ClearcoatPbrMaterialKind } from '@flighthq/types';

import {
  buildWgpuPbrStandardDefineKey,
  ensureWgpuPbrMaterialBindGroup,
  getWgpuPbrMaterialScratch,
  writeWgpuPbrMaterialUniform,
  writeWgpuPbrStandardBlock,
} from './standardPbrWgpuMeshMaterialRenderer';
import { registerWgpuMeshMaterialRenderer } from './wgpuMeshMaterialRegistry';
import { beginWgpuMeshDraw, drawWgpuMeshSubset, writeWgpuFrameUniform } from './wgpuMeshPipeline';
import { ensureWgpuPbrPipeline } from './wgpuPbrPipelineCache';

// The built-in Clearcoat (KHR_materials_clearcoat) forward-lit mesh-material renderer — the WGSL mirror
// of clearcoatPbrGlMeshMaterialRenderer. Clearcoat adds a second, always-dielectric GGX specular lobe
// (F0 = 0.04) over the base PBR layer — the wet, lacquered highlight of car paint or varnish — with its
// own clearcoat roughness, and attenuates the base layers by the clearcoat's Fresnel so energy is
// conserved. bind builds the standard define key from `material.standard` + the surface trailer, sets
// the CLEARCOAT flag, selects/compiles that pipeline variant for the current color format, writes the
// shared Frame uniform, then writes the base block + the clearcoat factors into the one MaterialBlock
// uniform and binds it at group(2). The clearcoat lobe lives behind `const CLEARCOAT` in the one PBR
// uber-shader. The clearcoat/roughness/normal maps are reserved by the descriptor but NOT sampled on
// wgpu yet (scalar clearcoat is the current approximation; maps deferred). See
// registerClearcoatPbrWgpuMaterial.
export const clearcoatPbrWgpuMeshMaterialRenderer: WgpuMeshMaterialRenderer = {
  bind(
    state: WgpuRenderState,
    material: Readonly<Material> | null,
    lights: Readonly<SceneLightBlock>,
    camera: Readonly<Camera3D>,
  ): void {
    const stateRuntime = getWgpuRenderStateRuntime(state);
    const pass = stateRuntime.renderPass;
    if (pass === null) return;

    const clearcoat = material as Readonly<ClearcoatPbrMaterial> | null;
    const standard = clearcoat !== null ? clearcoat.standard : null;
    const key = buildWgpuPbrStandardDefineKey(standard, clearcoat);
    key.clearcoatEnabled = true;
    const format = stateRuntime.currentColorFormat ?? state.format;
    const pipeline = ensureWgpuPbrPipeline(state, key, format);

    writeWgpuFrameUniform(state, camera, lights);
    const binding = ensureWgpuPbrMaterialBindGroup(state, pipeline, clearcoat ?? FALLBACK_MATERIAL, standard);
    const out = getWgpuPbrMaterialScratch();
    writeWgpuPbrStandardBlock(out, standard, clearcoat !== null ? clearcoat.alphaCutoff : 0.5);
    out.fill(0, 16);
    // clearcoat group (floats 16..19): clearcoat strength, clearcoat roughness.
    out[16] = clearcoat !== null ? clearcoat.clearcoat : 0;
    out[17] = clearcoat !== null ? clearcoat.clearcoatRoughness : 0;
    writeWgpuPbrMaterialUniform(state, binding);

    beginWgpuMeshDraw(state, pipeline);
    pass.setBindGroup(2, binding.bindGroup);
  },

  draw(state: WgpuRenderState, proxy: Readonly<SceneRenderProxy>, geometry: Readonly<MeshGeometry>): void {
    drawWgpuMeshSubset(state, proxy, geometry);
  },
};

// Installs the built-in Clearcoat renderer for ClearcoatPbrMaterialKind on this state. Opt-in (no
// top-level side effect): drawScene only draws Clearcoat subsets once this is called.
export function registerClearcoatPbrWgpuMaterial(state: WgpuRenderState): void {
  registerWgpuMeshMaterialRenderer(state, ClearcoatPbrMaterialKind, clearcoatPbrWgpuMeshMaterialRenderer);
}

const FALLBACK_MATERIAL = {} as Readonly<ClearcoatPbrMaterial>;
