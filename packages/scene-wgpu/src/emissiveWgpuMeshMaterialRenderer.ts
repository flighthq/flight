import type { LinearColor } from '@flighthq/materials';
import { unpackColorToLinear } from '@flighthq/materials';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu';
import type {
  Camera,
  EmissiveMaterial,
  Material,
  MeshGeometry,
  SceneLightBlock,
  SceneRenderProxy,
  WgpuMeshMaterialRenderer,
  WgpuRenderState,
} from '@flighthq/types';
import { EmissiveMaterialKind } from '@flighthq/types';

import { registerWgpuMeshMaterialRenderer } from './wgpuMeshMaterialRegistry';
import { beginWgpuMeshDraw, drawWgpuMeshSubset, isWgpuTextureReady, writeWgpuFrameUniform } from './wgpuMeshPipeline';
import type { WgpuUnlitDefineKey } from './wgpuUnlitPrelude';
import { bindWgpuUnlitSurface, ensureWgpuUnlitPipeline } from './wgpuUnlitPrelude';

// The built-in Emissive forward renderer (WgpuMeshMaterialRenderer for EmissiveMaterialKind) — the WGSL
// mirror of emissiveGlMeshMaterialRenderer. Self-illuminating, lighting-independent: binds the linear
// emissive color scaled by emissiveStrength through the shared unlit pipeline (values > 1 drive bloom
// over the rgba16float scene target). See registerEmissiveWgpuMaterial.
export const emissiveWgpuMeshMaterialRenderer: WgpuMeshMaterialRenderer = {
  bind(
    state: WgpuRenderState,
    material: Readonly<Material> | null,
    _lights: Readonly<SceneLightBlock>,
    camera: Readonly<Camera>,
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

  draw(state: WgpuRenderState, proxy: Readonly<SceneRenderProxy>, geometry: Readonly<MeshGeometry>): void {
    drawWgpuMeshSubset(state, proxy, geometry);
  },
};

// Registers the built-in Emissive renderer for EmissiveMaterialKind on this state. Opt-in (no top-level
// side effect); call once per WgpuRenderState before drawWgpuScene so meshes with EmissiveMaterials draw.
export function registerEmissiveWgpuMaterial(state: WgpuRenderState): void {
  registerWgpuMeshMaterialRenderer(state, EmissiveMaterialKind, emissiveWgpuMeshMaterialRenderer);
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
