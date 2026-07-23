import { unpackColorToLinear } from '@flighthq/color';
import { hasImageResourcePixels } from '@flighthq/image';
import { bindGlImageResourceTexture } from '@flighthq/render-gl';
import type {
  LinearColor,
  Camera3D,
  GlMeshMaterialRenderer,
  GlRenderState,
  Material,
  MeshGeometry,
  SceneLightBlock,
  SceneRenderProxy,
  ToonMaterial,
  GlToonDefineKey,
  GlToonProgram,
} from '@flighthq/types';
import { ToonMaterialKind } from '@flighthq/types';

import { bindGlMeshLightBlock } from './glLitProgram';
import { registerGlMeshMaterialRenderer } from './glMeshMaterialRegistry';
import {
  beginGlMeshDraw,
  bindGlUvTransform,
  drawGlMeshSubset,
  hasGlUvTransform,
  setGlMeshCameraPosition,
  setGlMeshViewProjection,
} from './glMeshProgram';
import { getGlSceneRuntime } from './glSceneRuntime';
import { ensureGlToonProgram } from './glToonPrelude';

// The built-in Toon (cel-shading) forward-lit mesh-material renderer (GlMeshMaterialRenderer for
// ToonMaterialKind). bind selects the uber-shader variant for the material's base-color map / ramp /
// alpha mode, uploads the shared per-run uniforms (camera view-projection + position, the packed
// light block), and the material's base color, step count, cutoff, and textures. The diffuse N·L is
// quantized into stepped cel bands in the fragment stage (ramp lookup when a ramp is bound, else a
// stepped floor over `steps`); output is LINEAR color for the rgba16f scene target. draw uploads the
// geometry's GPU buffers lazily (cached by geometry.version), sets the per-draw model + normal
// matrices from the proxy, and issues the indexed draw over the proxy's subset with depth-test LESS +
// depth-write on and back-face culling unless the material is double-sided. See registerToonGlMaterial
// to install it.
export const toonGlMeshMaterialRenderer: GlMeshMaterialRenderer = {
  bind(
    state: GlRenderState,
    material: Readonly<Material> | null,
    lights: Readonly<SceneLightBlock>,
    camera: Readonly<Camera3D>,
  ): void {
    const gl = state.gl;
    const toon = material as Readonly<ToonMaterial> | null;
    const program = ensureGlToonProgram(state, defineKeyForMaterial(toon));
    beginGlMeshDraw(state, program, toon !== null && toon.doubleSided);

    setGlMeshViewProjection(gl, program.locViewProjection, camera);
    setGlMeshCameraPosition(gl, program.locCameraPosition, camera);
    bindGlMeshLightBlock(state, program, lights);
    bindGlToonMaterialUniforms(state, program, toon);
  },

  draw(state: GlRenderState, proxy: Readonly<SceneRenderProxy>, geometry: Readonly<MeshGeometry>): void {
    const program = getGlSceneRuntime(state).activeMeshProgram;
    if (program === null) return;
    drawGlMeshSubset(state, program, proxy, geometry);
  },
};

// Registers the built-in Toon renderer for ToonMaterialKind on this state. Opt-in (no top-level side
// effect); call once per GlRenderState before drawScene so meshes with ToonMaterials draw.
export function registerToonGlMaterial(state: GlRenderState): void {
  registerGlMeshMaterialRenderer(state, ToonMaterialKind, toonGlMeshMaterialRenderer);
}

// The feature define key for a Toon material: which optional textures are present and whether alpha-
// mask cutoff is active. Drives both the program-cache variant and the bound textures. The ramp
// switches the fragment quantizer from a stepped floor to a 1D ramp lookup.
function defineKeyForMaterial(material: Readonly<ToonMaterial> | null): GlToonDefineKey {
  return {
    alphaMaskEnabled: material !== null && material.alphaMode === 'mask',
    hasBaseColorMap: material !== null && material.baseColorMap !== null && material.baseColorMap.image !== null,
    hasRamp: material !== null && material.ramp !== null && material.ramp.image !== null,
    hasUvTransform: hasGlUvTransform(material !== null ? material.baseColorMap : null),
  };
}

function bindGlToonMaterialUniforms(
  state: GlRenderState,
  program: Readonly<GlToonProgram>,
  material: Readonly<ToonMaterial> | null,
): void {
  const gl = state.gl;
  if (material === null) {
    gl.uniform4f(program.locBaseColor, 1, 1, 1, 1);
    gl.uniform1f(program.locSteps, 3);
    gl.uniform1f(program.locAlphaCutoff, 0.5);
    return;
  }

  unpackColorToLinear(scratchRgba, material.baseColor);
  gl.uniform4f(program.locBaseColor, scratchRgba[0], scratchRgba[1], scratchRgba[2], scratchRgba[3]);
  gl.uniform1f(program.locSteps, material.steps);
  gl.uniform1f(program.locAlphaCutoff, material.alphaCutoff);

  const baseColorMap = material.baseColorMap;
  if (baseColorMap !== null && baseColorMap.image !== null && hasImageResourcePixels(baseColorMap.image)) {
    gl.activeTexture(gl.TEXTURE0);
    bindGlImageResourceTexture(state, baseColorMap.image, baseColorMap.sampler);
    gl.uniform1i(program.locBaseColorMap, 0);
  }

  const ramp = material.ramp;
  if (ramp !== null && ramp.image !== null && hasImageResourcePixels(ramp.image)) {
    gl.activeTexture(gl.TEXTURE1);
    bindGlImageResourceTexture(state, ramp.image, ramp.sampler);
    gl.uniform1i(program.locRamp, 1);
  }

  bindGlUvTransform(gl, program, baseColorMap);
}

const scratchRgba: LinearColor = [0, 0, 0, 0];
