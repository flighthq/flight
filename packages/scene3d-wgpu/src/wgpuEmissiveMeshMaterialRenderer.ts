import { unpackColorToLinear } from '@flighthq/color/contract';
import {
  getWgpuRenderStateRuntime,
  registerWgpuBitmapTextureResolver,
  registerWgpuImageTextureResolver,
} from '@flighthq/render-wgpu/contract';
import type {
  LinearColor,
  Camera3D,
  EmissiveMaterial,
  Material,
  MeshGeometry,
  Scene3DLightBlock,
  Scene3DRenderProxy,
  WgpuMeshMaterialRenderer,
  WgpuRenderState,
  WgpuUnlitDefineKey,
} from '@flighthq/types/contract';
import { EmissiveMaterialKind } from '@flighthq/types/contract';

import { registerWgpuMeshMaterialRenderer } from './wgpuMeshMaterialRegistry.ts';
import {
  beginWgpuMeshDraw,
  drawWgpuMeshSubset,
  isWgpuTextureReady,
  writeWgpuFrameUniform,
} from './wgpuMeshPipeline.ts';
import { bindWgpuUnlitSurface, ensureWgpuUnlitPipeline } from './wgpuUnlitPrelude.ts';

// The built-in Emissive forward renderer (WgpuMeshMaterialRenderer for EmissiveMaterialKind) — the WGSL
// mirror of glEmissiveMeshMaterialRenderer. Self-illuminating, lighting-independent: binds the linear
// emissive color scaled by emissiveStrength through the shared unlit pipeline (values > 1 drive bloom
// over the rgba16float scene target). See registerWgpuEmissiveMaterial.
export const wgpuEmissiveMeshMaterialRenderer: WgpuMeshMaterialRenderer = {
  bind(
    state: WgpuRenderState,
    material: Readonly<Material> | null,
    _lights: Readonly<Scene3DLightBlock>,
    camera: Readonly<Camera3D>,
  ): void {
    const stateRuntime = getWgpuRenderStateRuntime(state);
    const pass = stateRuntime.renderPass;
    if (pass === null) return;

    const emissive = material as Readonly<EmissiveMaterial> | null;
    const format = stateRuntime.currentColorFormat ?? state.format;
    const pipeline = ensureWgpuUnlitPipeline(state, defineKeyForMaterial(emissive), format);
    writeWgpuFrameUniform(state, camera, _lights);

    let group: GPUBindGroup;
    if (emissive === null) {
      group = bindWgpuUnlitSurface(state, pipeline, FALLBACK_MATERIAL, WHITE, 1, 0.5, null);
    } else {
      unpackColorToLinear(_scratch, emissive.emissive);
      group = bindWgpuUnlitSurface(
        state,
        pipeline,
        emissive,
        _scratch,
        emissive.emissiveStrength,
        emissive.alphaCutoff,
        emissive.emissiveMap,
      );
    }

    beginWgpuMeshDraw(state, pipeline);
    pass.setBindGroup(2, group);
  },

  draw(state: WgpuRenderState, proxy: Readonly<Scene3DRenderProxy>, geometry: Readonly<MeshGeometry>): void {
    drawWgpuMeshSubset(state, proxy, geometry);
  },
};

// Registers the built-in Emissive renderer for EmissiveMaterialKind on this state. Opt-in (no top-level
// side effect); call once per WgpuRenderState before renderWgpuScene3D so meshes with EmissiveMaterials draw.
export function registerWgpuEmissiveMaterial(state: WgpuRenderState): void {
  registerWgpuBitmapTextureResolver(state);
  registerWgpuImageTextureResolver(state);
  registerWgpuMeshMaterialRenderer(state, EmissiveMaterialKind, wgpuEmissiveMeshMaterialRenderer);
}

function defineKeyForMaterial(material: Readonly<EmissiveMaterial> | null): WgpuUnlitDefineKey {
  return {
    alphaMaskEnabled: material !== null && material.alphaMode === 'mask',
    doubleSided: material !== null && material.doubleSided,
    hasColorMap: material !== null && isWgpuTextureReady(material.emissiveMap),
  };
}

const _scratch: LinearColor = [0, 0, 0, 0];
const WHITE: LinearColor = [1, 1, 1, 1];
const FALLBACK_MATERIAL = {} as Readonly<EmissiveMaterial>;
