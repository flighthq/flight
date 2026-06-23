import type { LinearColor } from '@flighthq/materials';
import { unpackColorToLinear } from '@flighthq/materials';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu';
import type {
  Camera,
  Material,
  MeshGeometry,
  PhongMaterial,
  SceneLightBlock,
  SceneRenderProxy,
  WgpuMeshMaterialRenderer,
  WgpuRenderState,
} from '@flighthq/types';
import { PhongMaterialKind } from '@flighthq/types';

import type { WgpuClassicDefineKey } from './wgpuClassicPrelude';
import { bindWgpuClassicSurface, ensureWgpuClassicPipeline } from './wgpuClassicPrelude';
import { registerWgpuMeshMaterialRenderer } from './wgpuMeshMaterialRegistry';
import {
  beginWgpuMeshDraw,
  drawWgpuMeshSubset,
  hasWgpuMaterialTexture,
  writeWgpuFrameUniform,
} from './wgpuMeshPipeline';

// The built-in classic Phong forward-lit mesh-material renderer (WgpuMeshMaterialRenderer for
// PhongMaterialKind) — the WGSL mirror of phongGlMeshMaterialRenderer. Lambert diffuse plus a
// reflection-vector specular lobe: bind selects the classic uber-shader's `phong` variant for the
// material's alpha mode + color format, writes the shared Frame uniform (camera position AND view-
// projection, since the specular term is view-dependent, plus the packed light block), binds the
// pipeline + Frame group (beginWgpuMeshDraw), then binds the material's linear diffuse + specular
// colors and shininess at group(2). draw issues the indexed draw. See registerPhongWgpuMaterial to
// install it.
export const phongWgpuMeshMaterialRenderer: WgpuMeshMaterialRenderer = {
  bind(
    state: WgpuRenderState,
    material: Readonly<Material> | null,
    lights: Readonly<SceneLightBlock>,
    camera: Readonly<Camera>,
  ): void {
    const stateRuntime = getWgpuRenderStateRuntime(state);
    const pass = stateRuntime.renderPass;
    if (pass === null) return;

    const phong = material as Readonly<PhongMaterial> | null;
    const format = stateRuntime.currentColorFormat ?? state.format;
    const pipeline = ensureWgpuClassicPipeline(state, defineKeyForMaterial(phong), format);
    writeWgpuFrameUniform(state, camera, lights);

    let group: GPUBindGroup;
    if (phong === null) {
      group = bindWgpuClassicSurface(state, pipeline, FALLBACK_MATERIAL, WHITE, WHITE, 32, 0.5, null, null, null);
    } else {
      unpackColorToLinear(_diffuse, phong.diffuse);
      unpackColorToLinear(_specular, phong.specular);
      group = bindWgpuClassicSurface(
        state,
        pipeline,
        phong,
        _diffuse,
        _specular,
        phong.shininess,
        phong.alphaCutoff,
        phong.diffuseMap,
        phong.specularMap,
        phong.normalMap,
      );
    }

    beginWgpuMeshDraw(state, pipeline);
    pass.setBindGroup(2, group);
  },

  draw(state: WgpuRenderState, proxy: Readonly<SceneRenderProxy>, geometry: Readonly<MeshGeometry>): void {
    drawWgpuMeshSubset(state, proxy, geometry);
  },
};

// Registers the built-in Phong renderer for PhongMaterialKind on this state. Opt-in (no top-level
// side effect); call once per WgpuRenderState before drawWgpuScene so meshes with PhongMaterials draw.
export function registerPhongWgpuMaterial(state: WgpuRenderState): void {
  registerWgpuMeshMaterialRenderer(state, PhongMaterialKind, phongWgpuMeshMaterialRenderer);
}

// The feature define key for a Phong material: the fixed `phong` lighting model plus the alpha-mask +
// double-sided flags and which optional maps are present (mirrors phongGlMeshMaterialRenderer).
function defineKeyForMaterial(material: Readonly<PhongMaterial> | null): WgpuClassicDefineKey {
  return {
    alphaMaskEnabled: material !== null && material.alphaMode === 'mask',
    doubleSided: material !== null && material.doubleSided,
    hasDiffuseMap: material !== null && hasWgpuMaterialTexture(material.diffuseMap),
    hasNormalMap: material !== null && hasWgpuMaterialTexture(material.normalMap),
    hasSpecularMap: material !== null && hasWgpuMaterialTexture(material.specularMap),
    lightingModel: 'phong',
  };
}

const _diffuse: LinearColor = [0, 0, 0, 0];
const _specular: LinearColor = [0, 0, 0, 0];
const WHITE: LinearColor = [1, 1, 1, 1];
const FALLBACK_MATERIAL = {} as Readonly<PhongMaterial>;
