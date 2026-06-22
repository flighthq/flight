import type {
  Camera,
  GlMeshMaterialRenderer,
  GlRenderState,
  IridescencePbrMaterial,
  Material,
  MeshGeometry,
  SceneLightBlock,
  SceneRenderProxy,
} from '@flighthq/types';
import { IridescencePbrMaterialKind } from '@flighthq/types';

import { bindGlMeshLightBlock } from './glLitProgram';
import { registerGlMeshMaterialRenderer } from './glMeshMaterialRegistry';
import { beginGlMeshDraw, drawGlMeshSubset, setGlMeshCameraPosition, setGlMeshViewProjection } from './glMeshProgram';
import { ensureGlPbrProgram } from './glPbrProgramCache';
import { bindGlPbrStandardBlock, buildGlPbrStandardDefineKey } from './glPbrStandardBlock';
import { getGlSceneRuntime } from './glSceneRuntime';

// The built-in Iridescence (KHR_materials_iridescence) forward-lit mesh-material renderer.
// Iridescence models a thin transparent film over the surface whose interference shifts the Fresnel
// reflectance toward a view- and thickness-dependent hue — soap bubbles, oil slicks, anodized metal.
// The shader applies a compact sinusoidal thin-film approximation (sample-viewer style) to F0 behind
// `#define IRIDESCENCE`. bind composes the material's `standard` block through the shared
// bindGlPbrStandardBlock and uploads the iridescence strength, film IOR, and a single film thickness
// (the midpoint of the descriptor's min/max nm range; the per-texel thickness map is reserved but not
// yet sampled). See registerIridescencePbrGlMaterial.
export const iridescencePbrGlMeshMaterialRenderer: GlMeshMaterialRenderer = {
  bind(
    state: GlRenderState,
    material: Readonly<Material> | null,
    lights: Readonly<SceneLightBlock>,
    camera: Readonly<Camera>,
  ): void {
    const gl = state.gl;
    const iridescence = material as Readonly<IridescencePbrMaterial> | null;
    const standard = iridescence !== null ? iridescence.standard : null;
    const key = buildGlPbrStandardDefineKey(standard, iridescence !== null && iridescence.alphaMode === 'mask');
    key.iridescenceEnabled = true;
    const program = ensureGlPbrProgram(state, key);
    beginGlMeshDraw(state, program, iridescence !== null && iridescence.doubleSided);

    setGlMeshViewProjection(gl, program.locViewProjection, camera);
    setGlMeshCameraPosition(gl, program.locCameraPosition, camera);
    bindGlMeshLightBlock(gl, program, lights);
    bindGlPbrStandardBlock(state, program, standard);
    gl.uniform1f(program.locAlphaCutoff, iridescence !== null ? iridescence.alphaCutoff : 0.5);

    if (iridescence !== null) {
      const thickness = (iridescence.iridescenceThicknessMin + iridescence.iridescenceThicknessMax) * 0.5;
      gl.uniform1f(program.locIridescence, iridescence.iridescence);
      gl.uniform1f(program.locIridescenceIor, iridescence.iridescenceIor);
      gl.uniform1f(program.locIridescenceThickness, thickness);
    } else {
      gl.uniform1f(program.locIridescence, 0);
      gl.uniform1f(program.locIridescenceIor, 1.3);
      gl.uniform1f(program.locIridescenceThickness, 250);
    }
  },

  draw(state: GlRenderState, proxy: Readonly<SceneRenderProxy>, geometry: Readonly<MeshGeometry>): void {
    const program = getGlSceneRuntime(state).activeMeshProgram;
    if (program === null) return;
    drawGlMeshSubset(state, program, proxy, geometry);
  },
};

// Installs the built-in Iridescence renderer for IridescencePbrMaterialKind on this state. Opt-in
// (no top-level side effect): drawScene only draws Iridescence subsets once this is called.
export function registerIridescencePbrGlMaterial(state: GlRenderState): void {
  registerGlMeshMaterialRenderer(state, IridescencePbrMaterialKind, iridescencePbrGlMeshMaterialRenderer);
}
