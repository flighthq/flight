import { unpackColorToLinear } from '@flighthq/color';
import type { LinearColor } from '@flighthq/types';
import type {
  Camera3D,
  GlMeshMaterialRenderer,
  GlRenderState,
  Material,
  MeshGeometry,
  SceneLightBlock,
  SceneRenderProxy,
  SubsurfacePbrMaterial,
} from '@flighthq/types';
import { SubsurfacePbrMaterialKind } from '@flighthq/types';

import { bindGlMeshLightBlock } from './glLitProgram';
import { registerGlMeshMaterialRenderer } from './glMeshMaterialRegistry';
import { beginGlMeshDraw, drawGlMeshSubset, setGlMeshCameraPosition, setGlMeshViewProjection } from './glMeshProgram';
import { ensureGlPbrProgram } from './glPbrProgramCache';
import { bindGlPbrStandardBlock, buildGlPbrStandardDefineKey } from './glPbrStandardBlock';
import { getGlSceneRuntime } from './glSceneRuntime';

// The built-in Subsurface forward-lit mesh-material renderer (Flight extension; flagged non-interop
// — there is no glTF equivalent). It approximates subsurface scattering with a wrapped-diffuse term:
// light wrapping past the terminator re-emerges tinted by `subsurfaceColor`, scaled by `subsurface`
// strength and inversely by `thickness` (thinner material = more translucency). This is a cheap
// stand-in for true diffusion-profile SSS — plausible for skin, wax, marble, foliage at forward-pass
// cost — and lives behind `#define SUBSURFACE` in the PBR uber-shader. bind composes the material's
// `standard` block through the shared bindGlPbrStandardBlock and uploads the subsurface scalars +
// linear-decoded subsurfaceColor. The subsurface/thickness maps are reserved but not yet sampled.
// See registerSubsurfacePbrGlMaterial.
export const subsurfacePbrGlMeshMaterialRenderer: GlMeshMaterialRenderer = {
  bind(
    state: GlRenderState,
    material: Readonly<Material> | null,
    lights: Readonly<SceneLightBlock>,
    camera: Readonly<Camera3D>,
  ): void {
    const gl = state.gl;
    const subsurface = material as Readonly<SubsurfacePbrMaterial> | null;
    const standard = subsurface !== null ? subsurface.standard : null;
    const key = buildGlPbrStandardDefineKey(standard, subsurface !== null && subsurface.alphaMode === 'mask');
    key.subsurfaceEnabled = true;
    const program = ensureGlPbrProgram(state, key);
    beginGlMeshDraw(state, program, subsurface !== null && subsurface.doubleSided);

    setGlMeshViewProjection(gl, program.locViewProjection, camera);
    setGlMeshCameraPosition(gl, program.locCameraPosition, camera);
    bindGlMeshLightBlock(state, program, lights);
    bindGlPbrStandardBlock(state, program, standard);
    gl.uniform1f(program.locAlphaCutoff, subsurface !== null ? subsurface.alphaCutoff : 0.5);

    if (subsurface !== null) {
      unpackColorToLinear(scratchRgba, subsurface.subsurfaceColor);
      gl.uniform1f(program.locSubsurface, subsurface.subsurface);
      gl.uniform3f(program.locSubsurfaceColor, scratchRgba[0], scratchRgba[1], scratchRgba[2]);
      gl.uniform1f(program.locThickness, subsurface.thickness);
    } else {
      gl.uniform1f(program.locSubsurface, 0);
      gl.uniform3f(program.locSubsurfaceColor, 1, 1, 1);
      gl.uniform1f(program.locThickness, 0);
    }
  },

  draw(state: GlRenderState, proxy: Readonly<SceneRenderProxy>, geometry: Readonly<MeshGeometry>): void {
    const program = getGlSceneRuntime(state).activeMeshProgram;
    if (program === null) return;
    drawGlMeshSubset(state, program, proxy, geometry);
  },
};

// Installs the built-in Subsurface renderer for SubsurfacePbrMaterialKind on this state. Opt-in (no
// top-level side effect): drawScene only draws Subsurface subsets once this is called.
export function registerSubsurfacePbrGlMaterial(state: GlRenderState): void {
  registerGlMeshMaterialRenderer(state, SubsurfacePbrMaterialKind, subsurfacePbrGlMeshMaterialRenderer);
}

const scratchRgba: LinearColor = [0, 0, 0, 0];
