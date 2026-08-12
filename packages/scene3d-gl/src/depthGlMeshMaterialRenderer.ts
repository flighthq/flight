import type {
  Camera3D,
  DepthMaterial,
  GlMeshMaterialRenderer,
  GlRenderState,
  Material,
  MeshGeometry,
  Scene3DLightBlock,
  Scene3DRenderProxy,
} from '@flighthq/types/contract';
import { DepthMaterialKind } from '@flighthq/types/contract';

import { bindGlDebugRange, ensureGlDebugProgram } from './glDebugPrelude';
import { registerGlMeshMaterialRenderer } from './glMeshMaterialRegistry';
import { beginGlMeshDraw, drawGlMeshSubset, setGlMeshViewProjection } from './glMeshProgram';
import { getGlScene3DRuntime } from './glScene3DRuntime';

// The built-in Depth forward renderer (GlMeshMaterialRenderer for DepthMaterialKind). A lighting-
// independent debug/utility pass material: bind selects the debug program in depth mode, uploads the
// camera view-projection + view matrices, and sets the material's [near, far] linearization range;
// draw issues the indexed draw. The vertex stage carries positive view-axis depth so perspective and
// orthographic cameras produce the same grayscale LINEAR meaning. Lights are ignored. See
// registerGlDepthMaterial to install it.
export const depthGlMeshMaterialRenderer: GlMeshMaterialRenderer = {
  bind(
    state: GlRenderState,
    material: Readonly<Material> | null,
    _lights: Readonly<Scene3DLightBlock>,
    camera: Readonly<Camera3D>,
  ): void {
    const depth = material as Readonly<DepthMaterial> | null;
    const program = ensureGlDebugProgram(state, { hasNormalMap: false, mode: 'depth' });
    beginGlMeshDraw(state, program, depth !== null && depth.doubleSided);
    setGlMeshViewProjection(state, program.locViewProjection, camera);
    state.gl.uniformMatrix4fv(program.locView, false, camera.view.m);

    if (depth === null) {
      bindGlDebugRange(state, program, 0, 1);
      return;
    }
    bindGlDebugRange(state, program, depth.near, depth.far);
  },

  draw(state: GlRenderState, proxy: Readonly<Scene3DRenderProxy>, geometry: Readonly<MeshGeometry>): void {
    const program = getGlScene3DRuntime(state).activeMeshProgram;
    if (program === null) return;
    drawGlMeshSubset(state, program, proxy, geometry);
  },
};

// Registers the built-in Depth renderer for DepthMaterialKind on this state. Opt-in (no top-level
// side effect); call once per GlRenderState before drawScene3D so meshes with DepthMaterials draw.
export function registerGlDepthMaterial(state: GlRenderState): void {
  registerGlMeshMaterialRenderer(state, DepthMaterialKind, depthGlMeshMaterialRenderer);
}
