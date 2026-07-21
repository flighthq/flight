import type {
  Camera3D,
  DepthMaterial,
  GlMeshMaterialRenderer,
  GlRenderState,
  Material,
  MeshGeometry,
  SceneLightBlock,
  SceneRenderProxy,
} from '@flighthq/types';
import { DepthMaterialKind } from '@flighthq/types';

import { bindGlDebugRange, ensureGlDebugProgram } from './glDebugPrelude';
import { registerGlMeshMaterialRenderer } from './glMeshMaterialRegistry';
import { beginGlMeshDraw, drawGlMeshSubset, setGlMeshViewProjection } from './glMeshProgram';
import { getGlSceneRuntime } from './glSceneRuntime';

// The built-in Depth forward renderer (GlMeshMaterialRenderer for DepthMaterialKind). A lighting-
// independent debug/utility pass material: bind selects the debug program in depth mode, uploads the
// camera view-projection, and sets the material's [near, far] linearization range; draw issues the
// indexed draw. The fragment stage linearizes window-space depth into eye space and writes it as
// grayscale LINEAR color. Lights are ignored. See registerDepthGlMaterial to install it.
export const depthGlMeshMaterialRenderer: GlMeshMaterialRenderer = {
  bind(
    state: GlRenderState,
    material: Readonly<Material> | null,
    _lights: Readonly<SceneLightBlock>,
    camera: Readonly<Camera3D>,
  ): void {
    const gl = state.gl;
    const depth = material as Readonly<DepthMaterial> | null;
    const program = ensureGlDebugProgram(state, { hasNormalMap: false, mode: 'depth' });
    beginGlMeshDraw(state, program, depth !== null && depth.doubleSided);
    setGlMeshViewProjection(gl, program.locViewProjection, camera);

    if (depth === null) {
      bindGlDebugRange(state, program, 0, 1);
      return;
    }
    bindGlDebugRange(state, program, depth.near, depth.far);
  },

  draw(state: GlRenderState, proxy: Readonly<SceneRenderProxy>, geometry: Readonly<MeshGeometry>): void {
    const program = getGlSceneRuntime(state).activeMeshProgram;
    if (program === null) return;
    drawGlMeshSubset(state, program, proxy, geometry);
  },
};

// Registers the built-in Depth renderer for DepthMaterialKind on this state. Opt-in (no top-level
// side effect); call once per GlRenderState before drawScene so meshes with DepthMaterials draw.
export function registerDepthGlMaterial(state: GlRenderState): void {
  registerGlMeshMaterialRenderer(state, DepthMaterialKind, depthGlMeshMaterialRenderer);
}
