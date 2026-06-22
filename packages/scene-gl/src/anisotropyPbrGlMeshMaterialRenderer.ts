import type {
  AnisotropyPbrMaterial,
  Camera,
  GlMeshMaterialRenderer,
  GlRenderState,
  Material,
  MeshGeometry,
  SceneLightBlock,
  SceneRenderProxy,
} from '@flighthq/types';
import { AnisotropyPbrMaterialKind } from '@flighthq/types';

import { bindGlMeshLightBlock } from './glLitProgram';
import { registerGlMeshMaterialRenderer } from './glMeshMaterialRegistry';
import { beginGlMeshDraw, drawGlMeshSubset, setGlMeshCameraPosition, setGlMeshViewProjection } from './glMeshProgram';
import { ensureGlPbrProgram } from './glPbrProgramCache';
import { bindGlPbrStandardBlock, buildGlPbrStandardDefineKey } from './glPbrStandardBlock';
import { getGlSceneRuntime } from './glSceneRuntime';

// The built-in Anisotropy (KHR_materials_anisotropy) forward-lit mesh-material renderer. Anisotropy
// stretches the specular highlight along the mesh tangent direction — brushed metal, hair, vinyl —
// by splitting roughness into along-tangent and across-tangent axes and evaluating an anisotropic
// GGX distribution (Burley) in the shader's rotated tangent frame. It REQUIRES mesh tangents, which
// the PBR vertex record already carries (location 2). bind composes the material's `standard` block
// through the shared bindGlPbrStandardBlock and uploads the anisotropy strength + rotation; the lobe
// lives behind `#define ANISOTROPY` in the PBR uber-shader. The anisotropy direction map is reserved
// by the descriptor but not yet sampled here. See registerAnisotropyPbrGlMaterial.
export const anisotropyPbrGlMeshMaterialRenderer: GlMeshMaterialRenderer = {
  bind(
    state: GlRenderState,
    material: Readonly<Material> | null,
    lights: Readonly<SceneLightBlock>,
    camera: Readonly<Camera>,
  ): void {
    const gl = state.gl;
    const anisotropy = material as Readonly<AnisotropyPbrMaterial> | null;
    const standard = anisotropy !== null ? anisotropy.standard : null;
    const key = buildGlPbrStandardDefineKey(standard, anisotropy !== null && anisotropy.alphaMode === 'mask');
    key.anisotropyEnabled = true;
    const program = ensureGlPbrProgram(state, key);
    beginGlMeshDraw(state, program, anisotropy !== null && anisotropy.doubleSided);

    setGlMeshViewProjection(gl, program.locViewProjection, camera);
    setGlMeshCameraPosition(gl, program.locCameraPosition, camera);
    bindGlMeshLightBlock(gl, program, lights);
    bindGlPbrStandardBlock(state, program, standard);
    gl.uniform1f(program.locAlphaCutoff, anisotropy !== null ? anisotropy.alphaCutoff : 0.5);

    gl.uniform1f(program.locAnisotropyStrength, anisotropy !== null ? anisotropy.anisotropyStrength : 0);
    gl.uniform1f(program.locAnisotropyRotation, anisotropy !== null ? anisotropy.anisotropyRotation : 0);
  },

  draw(state: GlRenderState, proxy: Readonly<SceneRenderProxy>, geometry: Readonly<MeshGeometry>): void {
    const program = getGlSceneRuntime(state).activeMeshProgram;
    if (program === null) return;
    drawGlMeshSubset(state, program, proxy, geometry);
  },
};

// Installs the built-in Anisotropy renderer for AnisotropyPbrMaterialKind on this state. Opt-in (no
// top-level side effect): drawScene only draws Anisotropy subsets once this is called.
export function registerAnisotropyPbrGlMaterial(state: GlRenderState): void {
  registerGlMeshMaterialRenderer(state, AnisotropyPbrMaterialKind, anisotropyPbrGlMeshMaterialRenderer);
}
