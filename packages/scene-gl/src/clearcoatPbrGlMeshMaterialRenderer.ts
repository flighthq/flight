import type {
  Camera3D,
  ClearcoatPbrMaterial,
  GlMeshMaterialRenderer,
  GlRenderState,
  Material,
  MeshGeometry,
  SceneLightBlock,
  SceneRenderProxy,
} from '@flighthq/types';
import { ClearcoatPbrMaterialKind } from '@flighthq/types';

import { bindGlMeshLightBlock } from './glLitProgram';
import { registerGlMeshMaterialRenderer } from './glMeshMaterialRegistry';
import { beginGlMeshDraw, drawGlMeshSubset, setGlMeshCameraPosition, setGlMeshViewProjection } from './glMeshProgram';
import { ensureGlPbrProgram } from './glPbrProgramCache';
import { bindGlPbrStandardBlock, buildGlPbrStandardDefineKey } from './glPbrStandardBlock';
import { getGlSceneRuntime } from './glSceneRuntime';

// The built-in Clearcoat (KHR_materials_clearcoat) forward-lit mesh-material renderer. Clearcoat
// adds a second, always-dielectric GGX specular lobe (F0 = 0.04) over the base PBR layer — the wet,
// lacquered highlight of car paint or varnish — with its own clearcoat roughness, and attenuates the
// base layers by the clearcoat's Fresnel so energy is conserved. bind composes the material's
// `standard` block (full StandardPbrMaterialProperties) through the shared bindGlPbrStandardBlock and
// then uploads the clearcoat-specific scalars; the clearcoat lobe lives behind `#define CLEARCOAT` in
// the one PBR uber-shader. The clearcoat/roughness/normal maps are reserved by the descriptor but not
// yet sampled here (scalar clearcoat is the current approximation). See registerClearcoatPbrGlMaterial.
export const clearcoatPbrGlMeshMaterialRenderer: GlMeshMaterialRenderer = {
  bind(
    state: GlRenderState,
    material: Readonly<Material> | null,
    lights: Readonly<SceneLightBlock>,
    camera: Readonly<Camera3D>,
  ): void {
    const gl = state.gl;
    const clearcoat = material as Readonly<ClearcoatPbrMaterial> | null;
    const standard = clearcoat !== null ? clearcoat.standard : null;
    const key = buildGlPbrStandardDefineKey(standard, clearcoat !== null && clearcoat.alphaMode === 'mask');
    key.clearcoatEnabled = true;
    const program = ensureGlPbrProgram(state, key);
    beginGlMeshDraw(state, program, clearcoat !== null && clearcoat.doubleSided);

    setGlMeshViewProjection(gl, program.locViewProjection, camera);
    setGlMeshCameraPosition(gl, program.locCameraPosition, camera);
    bindGlMeshLightBlock(state, program, lights);
    bindGlPbrStandardBlock(state, program, standard);
    gl.uniform1f(program.locAlphaCutoff, clearcoat !== null ? clearcoat.alphaCutoff : 0.5);

    gl.uniform1f(program.locClearcoat, clearcoat !== null ? clearcoat.clearcoat : 0);
    gl.uniform1f(program.locClearcoatRoughness, clearcoat !== null ? clearcoat.clearcoatRoughness : 0);
  },

  draw(state: GlRenderState, proxy: Readonly<SceneRenderProxy>, geometry: Readonly<MeshGeometry>): void {
    const program = getGlSceneRuntime(state).activeMeshProgram;
    if (program === null) return;
    drawGlMeshSubset(state, program, proxy, geometry);
  },
};

// Installs the built-in Clearcoat renderer for ClearcoatPbrMaterialKind on this state. Opt-in (no
// top-level side effect): drawScene only draws Clearcoat subsets once this is called.
export function registerClearcoatPbrGlMaterial(state: GlRenderState): void {
  registerGlMeshMaterialRenderer(state, ClearcoatPbrMaterialKind, clearcoatPbrGlMeshMaterialRenderer);
}
