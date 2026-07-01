import type { LinearColor } from '@flighthq/materials';
import { unpackColorToLinear } from '@flighthq/materials';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu';
import type {
  Camera,
  LambertMaterial,
  Material,
  MeshGeometry,
  SceneLightBlock,
  SceneRenderProxy,
  WgpuMeshMaterialRenderer,
  WgpuRenderState,
} from '@flighthq/types';
import { LambertMaterialKind } from '@flighthq/types';

import type { WgpuClassicDefineKey } from './wgpuClassicPrelude';
import { bindWgpuClassicSurface, ensureWgpuClassicPipeline } from './wgpuClassicPrelude';
import { registerWgpuMeshMaterialRenderer } from './wgpuMeshMaterialRegistry';
import { beginWgpuMeshDraw, drawWgpuMeshSubset, isWgpuTextureReady, writeWgpuFrameUniform } from './wgpuMeshPipeline';

// The built-in classic Lambert forward-lit mesh-material renderer (WgpuMeshMaterialRenderer for
// LambertMaterialKind) — the WGSL mirror of lambertGlMeshMaterialRenderer. Diffuse-only Lambertian
// shading: bind selects the classic uber-shader's `lambert` variant for the material's alpha mode +
// color format, writes the shared Frame uniform (camera + the packed light block), binds the pipeline
// + Frame group (beginWgpuMeshDraw), then binds the material's linear diffuse color at group(2). draw
// issues the indexed draw. Lambert has no view-dependent term, so the classic prelude compiles out its
// specular branch (the specular color it binds is unused). See registerLambertWgpuMaterial to install.
export const lambertWgpuMeshMaterialRenderer: WgpuMeshMaterialRenderer = {
  bind(
    state: WgpuRenderState,
    material: Readonly<Material> | null,
    lights: Readonly<SceneLightBlock>,
    camera: Readonly<Camera>,
  ): void {
    const stateRuntime = getWgpuRenderStateRuntime(state);
    const pass = stateRuntime.renderPass;
    if (pass === null) return;

    const lambert = material as Readonly<LambertMaterial> | null;
    const format = stateRuntime.currentColorFormat ?? state.format;
    const pipeline = ensureWgpuClassicPipeline(state, defineKeyForMaterial(lambert), format);
    writeWgpuFrameUniform(state, camera, lights);

    let group: GPUBindGroup;
    if (lambert === null) {
      group = bindWgpuClassicSurface(state, pipeline, FALLBACK_MATERIAL, WHITE, WHITE, 32, 0.5, null, null, null);
    } else {
      unpackColorToLinear(_diffuse, lambert.diffuse);
      group = bindWgpuClassicSurface(
        state,
        pipeline,
        lambert,
        _diffuse,
        WHITE,
        32,
        lambert.alphaCutoff,
        lambert.diffuseMap,
        null,
        null,
      );
    }

    beginWgpuMeshDraw(state, pipeline);
    pass.setBindGroup(2, group);
  },

  draw(state: WgpuRenderState, proxy: Readonly<SceneRenderProxy>, geometry: Readonly<MeshGeometry>): void {
    drawWgpuMeshSubset(state, proxy, geometry);
  },
};

// Registers the built-in Lambert renderer for LambertMaterialKind on this state. Opt-in (no top-level
// side effect); call once per WgpuRenderState before drawWgpuScene so meshes with LambertMaterials draw.
export function registerLambertWgpuMaterial(state: WgpuRenderState): void {
  registerWgpuMeshMaterialRenderer(state, LambertMaterialKind, lambertWgpuMeshMaterialRenderer);
}

// The feature define key for a Lambert material: the fixed `lambert` lighting model plus the alpha-mask
// + double-sided flags and whether a diffuse map is present. Lambert has no specular or normal map
// (mirrors lambertGlMeshMaterialRenderer's diffuse-only map handling).
function defineKeyForMaterial(material: Readonly<LambertMaterial> | null): WgpuClassicDefineKey {
  return {
    alphaMaskEnabled: material !== null && material.alphaMode === 'mask',
    doubleSided: material !== null && material.doubleSided,
    hasDiffuseMap: material !== null && isWgpuTextureReady(material.diffuseMap),
    hasNormalMap: false,
    hasSpecularMap: false,
    lightingModel: 'lambert',
  };
}

const _diffuse: LinearColor = [0, 0, 0, 0];
const WHITE: LinearColor = [1, 1, 1, 1];
const FALLBACK_MATERIAL = {} as Readonly<LambertMaterial>;
