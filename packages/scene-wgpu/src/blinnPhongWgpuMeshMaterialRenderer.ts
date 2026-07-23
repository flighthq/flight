import { unpackColorToLinear } from '@flighthq/color';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu';
import type {
  LinearColor,
  BlinnPhongMaterial,
  Camera3D,
  Material,
  MeshGeometry,
  SceneLightBlock,
  SceneRenderProxy,
  WgpuMeshMaterialRenderer,
  WgpuRenderState,
  WgpuClassicDefineKey,
} from '@flighthq/types';
import { BlinnPhongMaterialKind } from '@flighthq/types';

import { bindWgpuClassicSurface, ensureWgpuClassicPipeline } from './wgpuClassicPrelude';
import { registerWgpuMeshMaterialRenderer } from './wgpuMeshMaterialRegistry';
import { beginWgpuMeshDraw, drawWgpuMeshSubset, isWgpuTextureReady, writeWgpuFrameUniform } from './wgpuMeshPipeline';

// The built-in classic BlinnPhong forward-lit mesh-material renderer (WgpuMeshMaterialRenderer for
// BlinnPhongMaterialKind) — the WGSL mirror of blinnPhongGlMeshMaterialRenderer. Lambert diffuse plus
// a half-vector specular lobe (cheaper, smoother highlights than reflection-vector Phong): bind selects
// the classic uber-shader's `blinnphong` variant for the material's alpha mode + color format, writes
// the shared Frame uniform (camera position AND view-projection, since the specular term is view-
// dependent, plus the packed light block), binds the pipeline + Frame group (beginWgpuMeshDraw), then
// binds the material's linear diffuse + specular colors and shininess at group(2). draw issues the
// indexed draw. See registerBlinnPhongWgpuMaterial to install it.
export const blinnPhongWgpuMeshMaterialRenderer: WgpuMeshMaterialRenderer = {
  bind(
    state: WgpuRenderState,
    material: Readonly<Material> | null,
    lights: Readonly<SceneLightBlock>,
    camera: Readonly<Camera3D>,
  ): void {
    const stateRuntime = getWgpuRenderStateRuntime(state);
    const pass = stateRuntime.renderPass;
    if (pass === null) return;

    const blinnPhong = material as Readonly<BlinnPhongMaterial> | null;
    const format = stateRuntime.currentColorFormat ?? state.format;
    const pipeline = ensureWgpuClassicPipeline(state, defineKeyForMaterial(blinnPhong), format);
    writeWgpuFrameUniform(state, camera, lights);

    let group: GPUBindGroup;
    if (blinnPhong === null) {
      group = bindWgpuClassicSurface(state, pipeline, FALLBACK_MATERIAL, WHITE, WHITE, 32, 0.5, null, null, null);
    } else {
      unpackColorToLinear(_diffuse, blinnPhong.diffuse);
      unpackColorToLinear(_specular, blinnPhong.specular);
      group = bindWgpuClassicSurface(
        state,
        pipeline,
        blinnPhong,
        _diffuse,
        _specular,
        blinnPhong.shininess,
        blinnPhong.alphaCutoff,
        blinnPhong.diffuseMap,
        blinnPhong.specularMap,
        blinnPhong.normalMap,
      );
    }

    beginWgpuMeshDraw(state, pipeline);
    pass.setBindGroup(2, group);
  },

  draw(state: WgpuRenderState, proxy: Readonly<SceneRenderProxy>, geometry: Readonly<MeshGeometry>): void {
    drawWgpuMeshSubset(state, proxy, geometry);
  },
};

// Registers the built-in BlinnPhong renderer for BlinnPhongMaterialKind on this state. Opt-in (no
// top-level side effect); call once per WgpuRenderState before drawWgpuScene so meshes with BlinnPhong
// materials draw.
export function registerBlinnPhongWgpuMaterial(state: WgpuRenderState): void {
  registerWgpuMeshMaterialRenderer(state, BlinnPhongMaterialKind, blinnPhongWgpuMeshMaterialRenderer);
}

// The feature define key for a BlinnPhong material: the fixed `blinnphong` lighting model plus the
// alpha-mask + double-sided flags and which optional maps are present (mirrors
// blinnPhongGlMeshMaterialRenderer).
function defineKeyForMaterial(material: Readonly<BlinnPhongMaterial> | null): WgpuClassicDefineKey {
  return {
    alphaMaskEnabled: material !== null && material.alphaMode === 'mask',
    doubleSided: material !== null && material.doubleSided,
    hasDiffuseMap: material !== null && isWgpuTextureReady(material.diffuseMap),
    hasNormalMap: material !== null && isWgpuTextureReady(material.normalMap),
    hasSpecularMap: material !== null && isWgpuTextureReady(material.specularMap),
    lightingModel: 'blinnphong',
  };
}

const _diffuse: LinearColor = [0, 0, 0, 0];
const _specular: LinearColor = [0, 0, 0, 0];
const WHITE: LinearColor = [1, 1, 1, 1];
const FALLBACK_MATERIAL = {} as Readonly<BlinnPhongMaterial>;
