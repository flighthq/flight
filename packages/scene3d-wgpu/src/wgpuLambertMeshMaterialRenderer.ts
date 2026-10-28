import type { LinearColorRaw } from '@flighthq/color/contract';
import { allocateLinearColor, unpackColorToLinear } from '@flighthq/color/contract';
import {
  getWgpuRenderStateRuntime,
  registerWgpuBitmapTextureResolver,
  registerWgpuImageTextureResolver,
} from '@flighthq/render-wgpu/contract';
import type {
  Camera3D,
  LambertMaterial,
  Material,
  MeshGeometry,
  Scene3DLightBlock,
  Scene3DRenderProxy,
  WgpuMeshMaterialRenderer,
  WgpuRenderState,
  WgpuClassicDefineKey,
} from '@flighthq/types/contract';
import { LambertMaterialKind } from '@flighthq/types/contract';

import { bindWgpuClassicSurface, ensureWgpuClassicPipeline } from './wgpuClassicPrelude.ts';
import { registerWgpuMeshMaterialRenderer } from './wgpuMeshMaterialRegistry.ts';
import {
  beginWgpuMeshDraw,
  drawWgpuMeshSubset,
  isWgpuTextureReady,
  writeWgpuFrameUniform,
} from './wgpuMeshPipeline.ts';

// The built-in classic Lambert forward-lit mesh-material renderer (WgpuMeshMaterialRenderer for
// LambertMaterialKind) — the WGSL mirror of glLambertMeshMaterialRenderer. Diffuse-only Lambertian
// shading: bind selects the classic uber-shader's `lambert` variant for the material's alpha mode +
// color format, writes the shared Frame uniform (camera + the packed light block), binds the pipeline
// + Frame group (beginWgpuMeshDraw), then binds the material's linear diffuse color at group(2). draw
// issues the indexed draw. Lambert has no view-dependent term, so the classic prelude compiles out its
// specular branch (the specular color it binds is unused). See registerWgpuLambertMaterial to install.
export const wgpuLambertMeshMaterialRenderer: WgpuMeshMaterialRenderer = {
  bind(
    state: WgpuRenderState,
    material: Readonly<Material> | null,
    lights: Readonly<Scene3DLightBlock>,
    camera: Readonly<Camera3D>,
  ): void {
    const stateRuntime = getWgpuRenderStateRuntime(state);
    const pass = stateRuntime.renderPass;
    if (pass === null) return;

    const lambert = material as Readonly<LambertMaterial> | null;
    const format = stateRuntime.currentColorFormat ?? state.format;
    const pipeline = ensureWgpuClassicPipeline(state, defineKeyForMaterial(lambert), format);
    writeWgpuFrameUniform(state, camera, lights);

    _specular.r = 1;
    _specular.g = 1;
    _specular.b = 1;
    _specular.a = 1;
    let group: GPUBindGroup;
    if (lambert === null) {
      _diffuse.r = 1;
      _diffuse.g = 1;
      _diffuse.b = 1;
      _diffuse.a = 1;
      group = bindWgpuClassicSurface(
        state,
        pipeline,
        FALLBACK_MATERIAL,
        _diffuse,
        _specular,
        32,
        0.5,
        null,
        null,
        null,
        null,
      );
    } else {
      unpackColorToLinear(_diffuse, lambert.diffuse);
      group = bindWgpuClassicSurface(
        state,
        pipeline,
        lambert,
        _diffuse,
        _specular,
        32,
        lambert.alphaCutoff,
        lambert.diffuseMap,
        null,
        null,
        null,
      );
    }

    beginWgpuMeshDraw(state, pipeline);
    pass.setBindGroup(2, group);
  },

  draw(state: WgpuRenderState, proxy: Readonly<Scene3DRenderProxy>, geometry: Readonly<MeshGeometry>): void {
    drawWgpuMeshSubset(state, proxy, geometry);
  },
};

// Registers the built-in Lambert renderer for LambertMaterialKind on this state. Opt-in (no top-level
// side effect); call once per WgpuRenderState before renderWgpuScene3D so meshes with LambertMaterials draw.
export function registerWgpuLambertMaterial(state: WgpuRenderState): void {
  registerWgpuBitmapTextureResolver(state);
  registerWgpuImageTextureResolver(state);
  registerWgpuMeshMaterialRenderer(state, LambertMaterialKind, wgpuLambertMeshMaterialRenderer);
}

// The feature define key for a Lambert material: the fixed `lambert` lighting model plus the alpha-mask
// + double-sided flags and whether a diffuse map is present. Lambert has no specular or normal map
// (mirrors glLambertMeshMaterialRenderer's diffuse-only map handling).
function defineKeyForMaterial(material: Readonly<LambertMaterial> | null): WgpuClassicDefineKey {
  return {
    alphaMaskEnabled: material !== null && material.alphaMode === 'mask',
    doubleSided: material !== null && material.doubleSided,
    hasAlphaMap: false,
    hasDiffuseMap: material !== null && isWgpuTextureReady(material.diffuseMap),
    hasNormalMap: false,
    hasSpecularMap: false,
    lightingModel: 'lambert',
  };
}

const _diffuse: LinearColorRaw = allocateLinearColor();
const _specular: LinearColorRaw = allocateLinearColor();
const FALLBACK_MATERIAL = {} as Readonly<LambertMaterial>;
