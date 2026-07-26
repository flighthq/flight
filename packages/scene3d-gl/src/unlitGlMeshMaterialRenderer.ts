import { unpackColorToLinear } from '@flighthq/color/contract';
import { isVideoTextureFrameReady } from '@flighthq/texture/contract';
import type {
  LinearColor,
  Camera3D,
  GlMeshMaterialRenderer,
  GlRenderState,
  Material,
  MeshGeometry,
  Scene3DLightBlock,
  Scene3DRenderProxy,
  UnlitMaterial,
  GlUnlitDefineKey,
} from '@flighthq/types/contract';
import { UnlitMaterialKind } from '@flighthq/types/contract';

import { registerGlMeshMaterialRenderer } from './glMeshMaterialRegistry';
import {
  beginGlMeshDraw,
  bindGlUvTransform,
  drawGlMeshSubset,
  hasGlUvTransform,
  setGlMeshViewProjection,
} from './glMeshProgram';
import { getGlScene3DRuntime } from './glScene3DRuntime';
import { bindGlUnlitSurface, bindGlUnlitVideoSurface, ensureGlUnlitProgram } from './glUnlitPrelude';

// The built-in Unlit forward renderer (GlMeshMaterialRenderer for UnlitMaterialKind). Lighting-
// independent flat color: bind selects the unlit variant for the material's base-color map / alpha
// mode, uploads the camera view-projection and the linear base color, and draw issues the indexed
// draw. Lights are ignored. See registerUnlitGlMaterial to install it.
export const unlitGlMeshMaterialRenderer: GlMeshMaterialRenderer = {
  bind(
    state: GlRenderState,
    material: Readonly<Material> | null,
    _lights: Readonly<Scene3DLightBlock>,
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
    const videoMap = unlit.baseColorVideoMap;
    if (videoMap !== null && isVideoTextureFrameReady(videoMap)) {
      bindGlUnlitVideoSurface(state, program, scratchRgba, 1, videoMap, unlit.alphaCutoff);
      bindGlUvTransform(gl, program, videoMap);
    } else {
      bindGlUnlitSurface(state, program, scratchRgba, 1, unlit.baseColorMap, unlit.alphaCutoff);
      bindGlUvTransform(gl, program, unlit.baseColorMap);
    }
  },

  draw(state: GlRenderState, proxy: Readonly<Scene3DRenderProxy>, geometry: Readonly<MeshGeometry>): void {
    const program = getGlScene3DRuntime(state).activeMeshProgram;
    if (program === null) return;
    drawGlMeshSubset(state, program, proxy, geometry);
  },
};

// Registers the built-in Unlit renderer for UnlitMaterialKind on this state. Opt-in (no top-level
// side effect); call once per GlRenderState before drawScene3D so meshes with UnlitMaterials draw.
export function registerUnlitGlMaterial(state: GlRenderState): void {
  registerGlMeshMaterialRenderer(state, UnlitMaterialKind, unlitGlMeshMaterialRenderer);
}

function defineKeyForMaterial(material: Readonly<UnlitMaterial> | null): GlUnlitDefineKey {
  return {
    alphaMaskEnabled: material !== null && material.alphaMode === 'mask',
    hasColorMap:
      material !== null &&
      ((material.baseColorVideoMap !== null && isVideoTextureFrameReady(material.baseColorVideoMap)) ||
        (material.baseColorMap !== null && material.baseColorMap.image !== null)),
    hasUvTransform:
      material !== null &&
      hasGlUvTransform(
        material.baseColorVideoMap !== null && isVideoTextureFrameReady(material.baseColorVideoMap)
          ? material.baseColorVideoMap
          : material.baseColorMap,
      ),
    vertexColor: false,
  };
}

const scratchRgba: LinearColor = [0, 0, 0, 0];
const WHITE: LinearColor = [1, 1, 1, 1];
