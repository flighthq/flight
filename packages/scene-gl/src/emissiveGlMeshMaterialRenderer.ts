import { unpackColorToLinear } from '@flighthq/color';
import type { LinearColor } from '@flighthq/types';
import type {
  Camera3D,
  EmissiveMaterial,
  GlMeshMaterialRenderer,
  GlRenderState,
  Material,
  MeshGeometry,
  SceneLightBlock,
  SceneRenderProxy,
} from '@flighthq/types';
import { EmissiveMaterialKind } from '@flighthq/types';

import { registerGlMeshMaterialRenderer } from './glMeshMaterialRegistry';
import {
  beginGlMeshDraw,
  bindGlUvTransform,
  drawGlMeshSubset,
  hasGlUvTransform,
  setGlMeshViewProjection,
} from './glMeshProgram';
import { getGlSceneRuntime } from './glSceneRuntime';
import type { GlUnlitDefineKey } from './glUnlitPrelude';
import { bindGlUnlitSurface, ensureGlUnlitProgram } from './glUnlitPrelude';

// The built-in Emissive forward renderer (GlMeshMaterialRenderer for EmissiveMaterialKind). Self-
// illuminating and lighting-independent: bind selects the unlit variant for the emissive map / alpha
// mode and uploads the linear emissive color scaled by emissiveStrength (values > 1 drive bloom over
// the rgba16f scene target). Lights are ignored. See registerEmissiveGlMaterial to install it.
export const emissiveGlMeshMaterialRenderer: GlMeshMaterialRenderer = {
  bind(
    state: GlRenderState,
    material: Readonly<Material> | null,
    _lights: Readonly<SceneLightBlock>,
    camera: Readonly<Camera3D>,
  ): void {
    const gl = state.gl;
    const emissive = material as Readonly<EmissiveMaterial> | null;
    const program = ensureGlUnlitProgram(state, defineKeyForMaterial(emissive));
    beginGlMeshDraw(state, program, emissive !== null && emissive.doubleSided);
    setGlMeshViewProjection(gl, program.locViewProjection, camera);

    if (emissive === null) {
      bindGlUnlitSurface(state, program, WHITE, 1, null, 0.5);
      return;
    }
    unpackColorToLinear(scratchRgba, emissive.emissive);
    bindGlUnlitSurface(
      state,
      program,
      scratchRgba,
      emissive.emissiveStrength,
      emissive.emissiveMap,
      emissive.alphaCutoff,
    );
    bindGlUvTransform(gl, program, emissive.emissiveMap);
  },

  draw(state: GlRenderState, proxy: Readonly<SceneRenderProxy>, geometry: Readonly<MeshGeometry>): void {
    const program = getGlSceneRuntime(state).activeMeshProgram;
    if (program === null) return;
    drawGlMeshSubset(state, program, proxy, geometry);
  },
};

// Registers the built-in Emissive renderer for EmissiveMaterialKind on this state. Opt-in (no top-
// level side effect); call once per GlRenderState before drawScene so meshes with EmissiveMaterials
// draw.
export function registerEmissiveGlMaterial(state: GlRenderState): void {
  registerGlMeshMaterialRenderer(state, EmissiveMaterialKind, emissiveGlMeshMaterialRenderer);
}

function defineKeyForMaterial(material: Readonly<EmissiveMaterial> | null): GlUnlitDefineKey {
  return {
    alphaMaskEnabled: material !== null && material.alphaMode === 'mask',
    hasColorMap: material !== null && material.emissiveMap !== null && material.emissiveMap.image !== null,
    hasUvTransform: hasGlUvTransform(material !== null ? material.emissiveMap : null),
    vertexColor: false,
  };
}

const scratchRgba: LinearColor = [0, 0, 0, 0];
const WHITE: LinearColor = [1, 1, 1, 1];
