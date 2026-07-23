import { unpackColorToLinear } from '@flighthq/color';
import type {
  LinearColor,
  Camera3D,
  GlMeshMaterialRenderer,
  GlRenderState,
  Material,
  MeshGeometry,
  SceneLightBlock,
  SceneRenderProxy,
  SheenPbrMaterial,
} from '@flighthq/types';
import { SheenPbrMaterialKind } from '@flighthq/types';

import { bindGlMeshLightBlock } from './glLitProgram';
import { registerGlMeshMaterialRenderer } from './glMeshMaterialRegistry';
import { beginGlMeshDraw, drawGlMeshSubset, setGlMeshCameraPosition, setGlMeshViewProjection } from './glMeshProgram';
import { ensureGlPbrProgram } from './glPbrProgramCache';
import { bindGlPbrStandardBlock, buildGlPbrStandardDefineKey } from './glPbrStandardBlock';
import { getGlSceneRuntime } from './glSceneRuntime';

// The built-in Sheen (KHR_materials_sheen) forward-lit mesh-material renderer. Sheen adds a
// retroreflective Charlie ("inverted GGX") lobe on top of the base specular — the soft grazing-angle
// glow of velvet, satin, and other cloth — tinted by `sheenColor` and widened by `sheenRoughness`.
// bind composes the material's `standard` block through the shared bindGlPbrStandardBlock and then
// uploads the sheen color/roughness; the lobe lives behind `#define SHEEN` in the PBR uber-shader.
// The packed sRgb `sheenColor` is decoded to linear on the CPU (unpackColorToLinear), matching the
// linear HDR radiance output. The sheen maps are reserved by the descriptor but not yet sampled here.
// See registerSheenPbrGlMaterial.
export const sheenPbrGlMeshMaterialRenderer: GlMeshMaterialRenderer = {
  bind(
    state: GlRenderState,
    material: Readonly<Material> | null,
    lights: Readonly<SceneLightBlock>,
    camera: Readonly<Camera3D>,
  ): void {
    const gl = state.gl;
    const sheen = material as Readonly<SheenPbrMaterial> | null;
    const standard = sheen !== null ? sheen.standard : null;
    const key = buildGlPbrStandardDefineKey(standard, sheen !== null && sheen.alphaMode === 'mask');
    key.sheenEnabled = true;
    const program = ensureGlPbrProgram(state, key);
    beginGlMeshDraw(state, program, sheen !== null && sheen.doubleSided);

    setGlMeshViewProjection(gl, program.locViewProjection, camera);
    setGlMeshCameraPosition(gl, program.locCameraPosition, camera);
    bindGlMeshLightBlock(state, program, lights);
    bindGlPbrStandardBlock(state, program, standard);
    gl.uniform1f(program.locAlphaCutoff, sheen !== null ? sheen.alphaCutoff : 0.5);

    if (sheen !== null) {
      unpackColorToLinear(scratchRgba, sheen.sheenColor);
      gl.uniform3f(program.locSheenColor, scratchRgba[0], scratchRgba[1], scratchRgba[2]);
      gl.uniform1f(program.locSheenRoughness, sheen.sheenRoughness);
    } else {
      gl.uniform3f(program.locSheenColor, 0, 0, 0);
      gl.uniform1f(program.locSheenRoughness, 0);
    }
  },

  draw(state: GlRenderState, proxy: Readonly<SceneRenderProxy>, geometry: Readonly<MeshGeometry>): void {
    const program = getGlSceneRuntime(state).activeMeshProgram;
    if (program === null) return;
    drawGlMeshSubset(state, program, proxy, geometry);
  },
};

// Installs the built-in Sheen renderer for SheenPbrMaterialKind on this state. Opt-in (no top-level
// side effect): drawScene only draws Sheen subsets once this is called.
export function registerSheenPbrGlMaterial(state: GlRenderState): void {
  registerGlMeshMaterialRenderer(state, SheenPbrMaterialKind, sheenPbrGlMeshMaterialRenderer);
}

const scratchRgba: LinearColor = [0, 0, 0, 0];
