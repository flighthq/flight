import type {
  Camera,
  GlMeshMaterialRenderer,
  GlRenderState,
  Material,
  MeshGeometry,
  SceneLightBlock,
  SceneRenderProxy,
  StandardPbrMaterial,
} from '@flighthq/types';

import { bindGlMeshLightBlock } from './glLitProgram';
import { beginGlMeshDraw, drawGlMeshSubset, setGlMeshCameraPosition, setGlMeshViewProjection } from './glMeshProgram';
import { ensureGlPbrProgram } from './glPbrProgramCache';
import { bindGlPbrStandardBlock, buildGlPbrStandardDefineKey } from './glPbrStandardBlock';
import { getGlSceneRuntime } from './glSceneRuntime';

// The built-in StandardPbr forward-lit mesh-material renderer (GlMeshMaterialRenderer for
// StandardPbrMaterialKind). bind selects the uber-shader variant for the material's maps/alpha mode,
// uploads the shared per-run uniforms (camera view-projection + position, the packed light block),
// and the full standard PBR block (scalars/colors + base-color/normal/metallic-roughness/occlusion/
// emissive maps) via the shared bindGlPbrStandardBlock helper — StandardPbr passes itself as the
// properties block since StandardPbrMaterial IS a StandardPbrMaterialProperties. draw uploads the
// geometry's GPU buffers lazily (cached by geometry.version), sets the per-draw model + normal
// matrices from the proxy, and issues the indexed draw over the proxy's subset with depth-test LESS +
// depth-write on and back-face culling unless the material is double-sided. See
// registerStandardPbrGlMaterial to install it.
export const standardPbrGlMeshMaterialRenderer: GlMeshMaterialRenderer = {
  bind(
    state: GlRenderState,
    material: Readonly<Material> | null,
    lights: Readonly<SceneLightBlock>,
    camera: Readonly<Camera>,
  ): void {
    const gl = state.gl;
    const pbr = material as Readonly<StandardPbrMaterial> | null;
    const program = ensureGlPbrProgram(
      state,
      buildGlPbrStandardDefineKey(pbr, pbr !== null && pbr.alphaMode === 'mask'),
    );
    beginGlMeshDraw(state, program, pbr !== null && pbr.doubleSided);

    setGlMeshViewProjection(gl, program.locViewProjection, camera);
    setGlMeshCameraPosition(gl, program.locCameraPosition, camera);
    bindGlMeshLightBlock(gl, program, lights);
    bindGlPbrStandardBlock(state, program, pbr);
    gl.uniform1f(program.locAlphaCutoff, pbr !== null ? pbr.alphaCutoff : 0.5);
  },

  draw(state: GlRenderState, proxy: Readonly<SceneRenderProxy>, geometry: Readonly<MeshGeometry>): void {
    const program = getGlSceneRuntime(state).activeMeshProgram;
    if (program === null) return;
    drawGlMeshSubset(state, program, proxy, geometry);
  },
};
