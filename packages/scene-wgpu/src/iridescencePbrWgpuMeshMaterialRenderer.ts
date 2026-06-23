import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu';
import type {
  Camera,
  IridescencePbrMaterial,
  Material,
  MeshGeometry,
  SceneLightBlock,
  SceneRenderProxy,
  WgpuMeshMaterialRenderer,
  WgpuRenderState,
} from '@flighthq/types';
import { IridescencePbrMaterialKind } from '@flighthq/types';

import {
  buildWgpuPbrStandardDefineKey,
  ensureWgpuPbrMaterialBindGroup,
  getWgpuPbrMaterialScratch,
  uploadWgpuPbrMaterialUniform,
  writeWgpuPbrStandardBlock,
} from './standardPbrWgpuMeshMaterialRenderer';
import { registerWgpuMeshMaterialRenderer } from './wgpuMeshMaterialRegistry';
import { beginWgpuMeshDraw, drawWgpuMeshSubset, writeWgpuFrameUniform } from './wgpuMeshPipeline';
import { ensureWgpuPbrPipeline } from './wgpuPbrPipelineCache';

// The built-in Iridescence (KHR_materials_iridescence) forward-lit mesh-material renderer — the WGSL
// mirror of iridescencePbrGlMeshMaterialRenderer. Iridescence models a thin transparent film over the
// surface whose interference shifts the Fresnel reflectance toward a view- and thickness-dependent hue
// — soap bubbles, oil slicks, anodized metal. The shader applies a compact sinusoidal thin-film
// approximation (sample-viewer style) to F0 behind `const IRIDESCENCE`. bind builds the standard define
// key from `material.standard` + the surface trailer, sets the IRIDESCENCE flag, selects/compiles that
// pipeline variant for the current color format, writes the shared Frame uniform, then writes the base
// block + the iridescence strength / film IOR / a single film thickness (the midpoint of the
// descriptor's min/max nm range) into the one MaterialBlock uniform and binds it at group(2). The
// per-texel thickness map is reserved but NOT sampled on wgpu yet (maps deferred). See
// registerIridescencePbrWgpuMaterial.
export const iridescencePbrWgpuMeshMaterialRenderer: WgpuMeshMaterialRenderer = {
  bind(
    state: WgpuRenderState,
    material: Readonly<Material> | null,
    lights: Readonly<SceneLightBlock>,
    camera: Readonly<Camera>,
  ): void {
    const stateRuntime = getWgpuRenderStateRuntime(state);
    const pass = stateRuntime.renderPass;
    if (pass === null) return;

    const iridescence = material as Readonly<IridescencePbrMaterial> | null;
    const standard = iridescence !== null ? iridescence.standard : null;
    const key = buildWgpuPbrStandardDefineKey(standard, iridescence);
    key.iridescenceEnabled = true;
    const format = stateRuntime.currentColorFormat ?? state.format;
    const pipeline = ensureWgpuPbrPipeline(state, key, format);

    writeWgpuFrameUniform(state, camera, lights);
    const binding = ensureWgpuPbrMaterialBindGroup(state, pipeline, iridescence ?? FALLBACK_MATERIAL, standard);
    const out = getWgpuPbrMaterialScratch();
    writeWgpuPbrStandardBlock(out, standard, iridescence !== null ? iridescence.alphaCutoff : 0.5);
    out.fill(0, 16);
    // iridescence group (floats 28..30): strength, film IOR, film thickness (nm; min/max midpoint).
    if (iridescence !== null) {
      out[28] = iridescence.iridescence;
      out[29] = iridescence.iridescenceIor;
      out[30] = (iridescence.iridescenceThicknessMin + iridescence.iridescenceThicknessMax) * 0.5;
    } else {
      out[28] = 0;
      out[29] = 1.3;
      out[30] = 250;
    }
    uploadWgpuPbrMaterialUniform(state, binding);

    beginWgpuMeshDraw(state, pipeline);
    pass.setBindGroup(2, binding.bindGroup);
  },

  draw(state: WgpuRenderState, proxy: Readonly<SceneRenderProxy>, geometry: Readonly<MeshGeometry>): void {
    drawWgpuMeshSubset(state, proxy, geometry);
  },
};

// Installs the built-in Iridescence renderer for IridescencePbrMaterialKind on this state. Opt-in (no
// top-level side effect): drawScene only draws Iridescence subsets once this is called.
export function registerIridescencePbrWgpuMaterial(state: WgpuRenderState): void {
  registerWgpuMeshMaterialRenderer(state, IridescencePbrMaterialKind, iridescencePbrWgpuMeshMaterialRenderer);
}

const FALLBACK_MATERIAL = {} as Readonly<IridescencePbrMaterial>;
