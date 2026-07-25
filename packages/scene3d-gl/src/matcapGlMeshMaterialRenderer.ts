import { unpackColorToLinear } from '@flighthq/color';
import type {
  LinearColor,
  Camera3D,
  GlMeshMaterialRenderer,
  GlRenderState,
  MatcapMaterial,
  Material,
  MeshGeometry,
  Scene3DLightBlock,
  Scene3DRenderProxy,
  GlMatcapDefineKey,
} from '@flighthq/types';
import { MatcapMaterialKind } from '@flighthq/types';

import { bindGlMatcapSurface, ensureGlMatcapProgram } from './glMatcapPrelude';
import { registerGlMeshMaterialRenderer } from './glMeshMaterialRegistry';
import { beginGlMeshDraw, drawGlMeshSubset, setGlMeshViewProjection } from './glMeshProgram';
import { getGlScene3DRuntime } from './glScene3DRuntime';

// The built-in Matcap forward renderer (GlMeshMaterialRenderer for MatcapMaterialKind). Lighting-
// independent material-capture shading: bind selects the matcap variant for the material's matcap
// texture / alpha mode, uploads the camera view-projection plus the camera view matrix (u_view, which
// the vertex scene2d uses to rotate the world-space normal into view space), and the linear tint; draw
// issues the indexed draw. Lights are ignored — the matcap texture is the prebaked lighting. See
// registerMatcapGlMaterial to install it.
export const matcapGlMeshMaterialRenderer: GlMeshMaterialRenderer = {
  bind(
    state: GlRenderState,
    material: Readonly<Material> | null,
    _lights: Readonly<Scene3DLightBlock>,
    camera: Readonly<Camera3D>,
  ): void {
    const gl = state.gl;
    const matcap = material as Readonly<MatcapMaterial> | null;
    const program = ensureGlMatcapProgram(state, defineKeyForMaterial(matcap));
    beginGlMeshDraw(state, program, matcap !== null && matcap.doubleSided);
    setGlMeshViewProjection(gl, program.locViewProjection, camera);
    // u_view rotates the world-space normal into view space for the matcap lookup.
    gl.uniformMatrix4fv(program.locView, false, camera.view.m);

    if (matcap === null) {
      bindGlMatcapSurface(state, program, WHITE, null, 0.5);
      return;
    }
    unpackColorToLinear(scratchRgba, matcap.tint);
    bindGlMatcapSurface(state, program, scratchRgba, matcap.matcap, matcap.alphaCutoff);
  },

  draw(state: GlRenderState, proxy: Readonly<Scene3DRenderProxy>, geometry: Readonly<MeshGeometry>): void {
    const program = getGlScene3DRuntime(state).activeMeshProgram;
    if (program === null) return;
    drawGlMeshSubset(state, program, proxy, geometry);
  },
};

// Registers the built-in Matcap renderer for MatcapMaterialKind on this state. Opt-in (no top-level
// side effect); call once per GlRenderState before drawScene3D so meshes with MatcapMaterials draw.
export function registerMatcapGlMaterial(state: GlRenderState): void {
  registerGlMeshMaterialRenderer(state, MatcapMaterialKind, matcapGlMeshMaterialRenderer);
}

function defineKeyForMaterial(material: Readonly<MatcapMaterial> | null): GlMatcapDefineKey {
  return {
    alphaMaskEnabled: material !== null && material.alphaMode === 'mask',
    hasMatcap: material !== null && material.matcap !== null && material.matcap.image !== null,
  };
}

const scratchRgba: LinearColor = [0, 0, 0, 0];
const WHITE: LinearColor = [1, 1, 1, 1];
