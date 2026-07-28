import { unpackColorToLinear } from '@flighthq/color/contract';
import {
  getWgpuRenderStateRuntime,
  registerWgpuImageTextureResolver,
  registerWgpuProducedTextureResolver,
  registerWgpuVideoTextureResolver,
} from '@flighthq/render-wgpu/contract';
import type {
  LinearColor,
  Camera3D,
  Material,
  MeshGeometry,
  Scene3DLightBlock,
  Scene3DRenderProxy,
  UnlitMaterial,
  WgpuMeshMaterialRenderer,
  WgpuRenderState,
  WgpuUnlitDefineKey,
} from '@flighthq/types/contract';
import { UnlitMaterialKind } from '@flighthq/types/contract';

import { registerWgpuMeshMaterialRenderer } from './wgpuMeshMaterialRegistry';
import { beginWgpuMeshDraw, drawWgpuMeshSubset, isWgpuTextureReady, writeWgpuFrameUniform } from './wgpuMeshPipeline';
import { bindWgpuUnlitSurface, ensureWgpuUnlitPipeline } from './wgpuUnlitPrelude';

// The built-in Unlit forward renderer (WgpuMeshMaterialRenderer for UnlitMaterialKind) — the WGSL
// mirror of unlitGlMeshMaterialRenderer. Lighting-independent flat color: bind selects the unlit
// pipeline variant for the alpha mode + color format, writes the shared Frame uniform (lights ignored),
// and binds the linear base color; draw issues the indexed draw. See registerUnlitWgpuMaterial.
export const unlitWgpuMeshMaterialRenderer: WgpuMeshMaterialRenderer = {
  bind(
    state: WgpuRenderState,
    material: Readonly<Material> | null,
    _lights: Readonly<Scene3DLightBlock>,
    camera: Readonly<Camera3D>,
  ): void {
    const stateRuntime = getWgpuRenderStateRuntime(state);
    const pass = stateRuntime.renderPass;
    if (pass === null) return;

    const unlit = material as Readonly<UnlitMaterial> | null;
    const format = stateRuntime.currentColorFormat ?? state.format;
    const pipeline = ensureWgpuUnlitPipeline(state, defineKeyForMaterial(unlit), format);
    writeWgpuFrameUniform(state, camera, _lights);

    let group: GPUBindGroup;
    if (unlit === null) {
      group = bindWgpuUnlitSurface(state, pipeline, FALLBACK_MATERIAL, WHITE, 1, 0.5, null);
    } else {
      unpackColorToLinear(_scratch, unlit.baseColor);
      group = bindWgpuUnlitSurface(state, pipeline, unlit, _scratch, 1, unlit.alphaCutoff, unlit.baseColorMap);
    }

    beginWgpuMeshDraw(state, pipeline);
    pass.setBindGroup(2, group);
  },

  draw(state: WgpuRenderState, proxy: Readonly<Scene3DRenderProxy>, geometry: Readonly<MeshGeometry>): void {
    drawWgpuMeshSubset(state, proxy, geometry);
  },
};

// Registers the built-in Unlit renderer for UnlitMaterialKind on this state. Opt-in (no top-level side
// effect); call once per WgpuRenderState before drawWgpuScene3D so meshes with UnlitMaterials draw.
export function registerUnlitWgpuMaterial(state: WgpuRenderState): void {
  registerWgpuImageTextureResolver(state);
  registerWgpuVideoTextureResolver(state);
  registerWgpuProducedTextureResolver(state);
  registerWgpuMeshMaterialRenderer(state, UnlitMaterialKind, unlitWgpuMeshMaterialRenderer);
}

function defineKeyForMaterial(material: Readonly<UnlitMaterial> | null): WgpuUnlitDefineKey {
  return {
    alphaMaskEnabled: material !== null && material.alphaMode === 'mask',
    doubleSided: material !== null && material.doubleSided,
    hasColorMap: material !== null && isWgpuTextureReady(material.baseColorMap),
  };
}

const _scratch: LinearColor = [0, 0, 0, 0];
const WHITE: LinearColor = [1, 1, 1, 1];
const FALLBACK_MATERIAL = {} as Readonly<UnlitMaterial>;
