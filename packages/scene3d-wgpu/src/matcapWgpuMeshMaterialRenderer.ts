import { unpackColorToLinear } from '@flighthq/color/contract';
import {
  getWgpuRenderStateRuntime,
  registerWgpuBitmapTextureResolver,
  registerWgpuImageTextureResolver,
} from '@flighthq/render-wgpu/contract';
import type {
  LinearColor,
  Camera3D,
  MatcapMaterial,
  Material,
  MeshGeometry,
  Scene3DLightBlock,
  Scene3DRenderProxy,
  WgpuMeshMaterialRenderer,
  WgpuRenderState,
  WgpuMatcapDefineKey,
} from '@flighthq/types/contract';
import { MatcapMaterialKind } from '@flighthq/types/contract';

import { bindWgpuMatcapSurface, ensureWgpuMatcapPipeline } from './wgpuMatcapPrelude';
import { registerWgpuMeshMaterialRenderer } from './wgpuMeshMaterialRegistry';
import { beginWgpuMeshDraw, drawWgpuMeshSubset, writeWgpuFrameUniform } from './wgpuMeshPipeline';

// The built-in Matcap forward renderer (WgpuMeshMaterialRenderer for MatcapMaterialKind) — the WGSL
// mirror of matcapGlMeshMaterialRenderer. Lighting-independent material-capture shading: bind selects
// the matcap pipeline variant for the alpha mode + color format, writes the shared Frame uniform
// (lights ignored — the matcap texture is the prebaked lighting), and binds the linear tint; draw
// issues the indexed draw. See registerWgpuMatcapMaterial to install it. The real matcap texture is not
// yet sampled on wgpu (hasMatcap stays false; see wgpuMatcapPrelude's note), so the surface renders as
// the tint alone for now.
export const matcapWgpuMeshMaterialRenderer: WgpuMeshMaterialRenderer = {
  bind(
    state: WgpuRenderState,
    material: Readonly<Material> | null,
    _lights: Readonly<Scene3DLightBlock>,
    camera: Readonly<Camera3D>,
  ): void {
    const stateRuntime = getWgpuRenderStateRuntime(state);
    const pass = stateRuntime.renderPass;
    if (pass === null) return;

    const matcap = material as Readonly<MatcapMaterial> | null;
    const format = stateRuntime.currentColorFormat ?? state.format;
    const pipeline = ensureWgpuMatcapPipeline(state, defineKeyForMaterial(matcap), format);
    writeWgpuFrameUniform(state, camera, _lights);

    let group: GPUBindGroup;
    if (matcap === null) {
      group = bindWgpuMatcapSurface(state, pipeline, FALLBACK_MATERIAL, WHITE, 0.5);
    } else {
      unpackColorToLinear(_scratch, matcap.tint);
      group = bindWgpuMatcapSurface(state, pipeline, matcap, _scratch, matcap.alphaCutoff);
    }

    beginWgpuMeshDraw(state, pipeline);
    pass.setBindGroup(2, group);
  },

  draw(state: WgpuRenderState, proxy: Readonly<Scene3DRenderProxy>, geometry: Readonly<MeshGeometry>): void {
    drawWgpuMeshSubset(state, proxy, geometry);
  },
};

// Registers the built-in Matcap renderer for MatcapMaterialKind on this state. Opt-in (no top-level
// side effect); call once per WgpuRenderState before drawWgpuScene3D so meshes with MatcapMaterials draw.
export function registerWgpuMatcapMaterial(state: WgpuRenderState): void {
  registerWgpuBitmapTextureResolver(state);
  registerWgpuImageTextureResolver(state);
  registerWgpuMeshMaterialRenderer(state, MatcapMaterialKind, matcapWgpuMeshMaterialRenderer);
}

function defineKeyForMaterial(material: Readonly<MatcapMaterial> | null): WgpuMatcapDefineKey {
  return {
    alphaMaskEnabled: material !== null && material.alphaMode === 'mask',
    doubleSided: material !== null && material.doubleSided,
    hasMatcap: false,
  };
}

const _scratch: LinearColor = [0, 0, 0, 0];
const WHITE: LinearColor = [1, 1, 1, 1];
const FALLBACK_MATERIAL = {} as Readonly<MatcapMaterial>;
