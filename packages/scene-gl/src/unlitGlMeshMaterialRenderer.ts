import { unpackColorToLinear } from '@flighthq/color';
import type {
  LinearColor,
  Camera3D,
  GlMeshMaterialRenderer,
  GlRenderState,
  Material,
  MeshGeometry,
  SceneLightBlock,
  SceneRenderProxy,
  UnlitMaterial,
  GlUnlitDefineKey,
} from '@flighthq/types';
import { UnlitMaterialKind } from '@flighthq/types';

import { registerGlMeshMaterialRenderer } from './glMeshMaterialRegistry';
import {
  beginGlMeshDraw,
  bindGlUvTransform,
  drawGlMeshSubset,
  hasGlUvTransform,
  setGlMeshViewProjection,
} from './glMeshProgram';
import { getGlSceneRuntime } from './glSceneRuntime';
import { bindGlUnlitSurface, ensureGlUnlitProgram } from './glUnlitPrelude';

// The built-in Unlit forward renderer (GlMeshMaterialRenderer for UnlitMaterialKind). Lighting-
// independent flat color: bind selects the unlit variant for the material's base-color map / alpha
// mode, uploads the camera view-projection and the linear base color, and draw issues the indexed
// draw. Lights are ignored. See registerUnlitGlMaterial to install it.
export const unlitGlMeshMaterialRenderer: GlMeshMaterialRenderer = {
  bind(
    state: GlRenderState,
    material: Readonly<Material> | null,
    _lights: Readonly<SceneLightBlock>,
    camera: Readonly<Camera3D>,
  ): void {
    const gl = state.gl;
    const unlit = material as Readonly<UnlitMaterial> | null;
    const program = ensureGlUnlitProgram(state, defineKeyForMaterial(unlit));
    beginGlMeshDraw(state, program, unlit !== null && unlit.doubleSided);
    setGlMeshViewProjection(gl, program.locViewProjection, camera);

    if (unlit === null) {
      bindGlUnlitSurface(state, program, WHITE, 1, null, 0.5);
      return;
    }
    unpackColorToLinear(scratchRgba, unlit.baseColor);
    bindGlUnlitSurface(state, program, scratchRgba, 1, unlit.baseColorMap, unlit.alphaCutoff);
    bindGlUvTransform(gl, program, unlit.baseColorMap);
  },

  draw(state: GlRenderState, proxy: Readonly<SceneRenderProxy>, geometry: Readonly<MeshGeometry>): void {
    const program = getGlSceneRuntime(state).activeMeshProgram;
    if (program === null) return;
    drawGlMeshSubset(state, program, proxy, geometry);
  },
};

// Registers the built-in Unlit renderer for UnlitMaterialKind on this state. Opt-in (no top-level
// side effect); call once per GlRenderState before drawScene so meshes with UnlitMaterials draw.
export function registerUnlitGlMaterial(state: GlRenderState): void {
  registerGlMeshMaterialRenderer(state, UnlitMaterialKind, unlitGlMeshMaterialRenderer);
}

function defineKeyForMaterial(material: Readonly<UnlitMaterial> | null): GlUnlitDefineKey {
  return {
    alphaMaskEnabled: material !== null && material.alphaMode === 'mask',
    hasColorMap: material !== null && material.baseColorMap !== null && material.baseColorMap.image !== null,
    hasUvTransform: hasGlUvTransform(material !== null ? material.baseColorMap : null),
    vertexColor: false,
  };
}

const scratchRgba: LinearColor = [0, 0, 0, 0];
const WHITE: LinearColor = [1, 1, 1, 1];
