import type {
  Camera3D,
  GlMeshMaterialRenderer,
  GlRenderState,
  Material,
  MeshGeometry,
  NormalMaterial,
  Scene3DLightBlock,
  Scene3DRenderProxy,
} from '@flighthq/types';
import { NormalMaterialKind } from '@flighthq/types';

import { bindGlDebugNormalMap, ensureGlDebugProgram } from './glDebugPrelude';
import { registerGlMeshMaterialRenderer } from './glMeshMaterialRegistry';
import { beginGlMeshDraw, drawGlMeshSubset, setGlMeshViewProjection } from './glMeshProgram';
import { getGlScene3DRuntime } from './glScene3DRuntime';

// The built-in Normal forward renderer (GlMeshMaterialRenderer for NormalMaterialKind). A lighting-
// independent debug/utility pass material: bind selects the debug program in normal mode (with the
// normal-map variant when the material binds one), uploads the camera view-projection, and binds the
// optional tangent-space normal map plus its scale; draw issues the indexed draw. The fragment scene2d
// transforms the geometric normal by the normal matrix (so the visualized normal is WORLD-space),
// optionally perturbs it through a TBN-built normal map, and encodes it as `n * 0.5 + 0.5` LINEAR
// color. Lights are ignored. See registerNormalGlMaterial to install it.
export const normalGlMeshMaterialRenderer: GlMeshMaterialRenderer = {
  bind(
    state: GlRenderState,
    material: Readonly<Material> | null,
    _lights: Readonly<Scene3DLightBlock>,
    camera: Readonly<Camera3D>,
  ): void {
    const gl = state.gl;
    const normal = material as Readonly<NormalMaterial> | null;
    const hasNormalMap = normal !== null && normal.normalMap !== null && normal.normalMap.image !== null;
    const program = ensureGlDebugProgram(state, { hasNormalMap, mode: 'normal' });
    beginGlMeshDraw(state, program, normal !== null && normal.doubleSided);
    setGlMeshViewProjection(gl, program.locViewProjection, camera);

    if (normal === null) {
      bindGlDebugNormalMap(state, program, null, 1);
      return;
    }
    bindGlDebugNormalMap(state, program, normal.normalMap, normal.normalScale);
  },

  draw(state: GlRenderState, proxy: Readonly<Scene3DRenderProxy>, geometry: Readonly<MeshGeometry>): void {
    const program = getGlScene3DRuntime(state).activeMeshProgram;
    if (program === null) return;
    drawGlMeshSubset(state, program, proxy, geometry);
  },
};

// Registers the built-in Normal renderer for NormalMaterialKind on this state. Opt-in (no top-level
// side effect); call once per GlRenderState before drawScene3D so meshes with NormalMaterials draw.
export function registerNormalGlMaterial(state: GlRenderState): void {
  registerGlMeshMaterialRenderer(state, NormalMaterialKind, normalGlMeshMaterialRenderer);
}
