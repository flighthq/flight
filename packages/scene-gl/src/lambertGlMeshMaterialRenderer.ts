import type { LinearColor } from '@flighthq/color';
import { unpackColorToLinear } from '@flighthq/color';
import { hasImageResourcePixels } from '@flighthq/image';
import { bindGlImageResourceTexture } from '@flighthq/render-gl';
import type {
  Camera3D,
  GlMeshMaterialRenderer,
  GlRenderState,
  LambertMaterial,
  Material,
  MeshGeometry,
  SceneLightBlock,
  SceneRenderProxy,
} from '@flighthq/types';
import { LambertMaterialKind } from '@flighthq/types';

import type { GlClassicDefineKey } from './glClassicPrelude';
import type { GlClassicProgram } from './glClassicPrelude';
import { ensureGlClassicProgram } from './glClassicPrelude';
import { bindGlMeshLightBlock } from './glLitProgram';
import { registerGlMeshMaterialRenderer } from './glMeshMaterialRegistry';
import {
  beginGlMeshDraw,
  bindGlUvTransform,
  drawGlMeshSubset,
  hasGlUvTransform,
  setGlMeshViewProjection,
} from './glMeshProgram';
import { getGlSceneRuntime } from './glSceneRuntime';

// The built-in classic Lambert forward-lit mesh-material renderer (GlMeshMaterialRenderer for
// LambertMaterialKind). Diffuse-only Lambertian shading: bind selects the classic uber-shader's
// `lambert` variant for the material's diffuse map / alpha mode, uploads the camera view-projection
// and the packed light block, and the material's linear diffuse color. draw issues the indexed draw.
// Lambert has no view-dependent term, so it skips the camera position; the shared classic prelude
// compiles out the specular branch for the `lambert` model. See registerLambertGlMaterial to install.
export const lambertGlMeshMaterialRenderer: GlMeshMaterialRenderer = {
  bind(
    state: GlRenderState,
    material: Readonly<Material> | null,
    lights: Readonly<SceneLightBlock>,
    camera: Readonly<Camera3D>,
  ): void {
    const gl = state.gl;
    const lambert = material as Readonly<LambertMaterial> | null;
    const program = ensureGlClassicProgram(state, defineKeyForMaterial(lambert));
    beginGlMeshDraw(state, program, lambert !== null && lambert.doubleSided);

    setGlMeshViewProjection(gl, program.locViewProjection, camera);
    bindGlMeshLightBlock(state, program, lights);
    bindGlLambertMaterialUniforms(state, program, lambert);
  },

  draw(state: GlRenderState, proxy: Readonly<SceneRenderProxy>, geometry: Readonly<MeshGeometry>): void {
    const program = getGlSceneRuntime(state).activeMeshProgram;
    if (program === null) return;
    drawGlMeshSubset(state, program, proxy, geometry);
  },
};

// Registers the built-in Lambert renderer for LambertMaterialKind on this state. Opt-in (no top-level
// side effect); call once per GlRenderState before drawScene so meshes with LambertMaterials draw.
export function registerLambertGlMaterial(state: GlRenderState): void {
  registerGlMeshMaterialRenderer(state, LambertMaterialKind, lambertGlMeshMaterialRenderer);
}

function bindGlLambertMaterialUniforms(
  state: GlRenderState,
  program: Readonly<GlClassicProgram>,
  material: Readonly<LambertMaterial> | null,
): void {
  const gl = state.gl;
  if (material === null) {
    gl.uniform4f(program.locDiffuse, 1, 1, 1, 1);
    gl.uniform1f(program.locAlphaCutoff, 0.5);
    return;
  }

  unpackColorToLinear(scratchRgba, material.diffuse);
  gl.uniform4f(program.locDiffuse, scratchRgba[0], scratchRgba[1], scratchRgba[2], scratchRgba[3]);
  gl.uniform1f(program.locAlphaCutoff, material.alphaCutoff);

  const diffuseMap = material.diffuseMap;
  if (diffuseMap !== null && diffuseMap.image !== null && hasImageResourcePixels(diffuseMap.image)) {
    gl.activeTexture(gl.TEXTURE0);
    bindGlImageResourceTexture(state, diffuseMap.image, diffuseMap.sampler);
    gl.uniform1i(program.locDiffuseMap, 0);
  }
  bindGlUvTransform(gl, program, diffuseMap);
}

// The feature define key for a Lambert material: the fixed `lambert` lighting model plus which optional
// maps are present and whether alpha-mask cutoff is active. Lambert never has specular or normal maps.
function defineKeyForMaterial(material: Readonly<LambertMaterial> | null): GlClassicDefineKey {
  return {
    alphaMaskEnabled: material !== null && material.alphaMode === 'mask',
    hasDiffuseMap: material !== null && material.diffuseMap !== null && material.diffuseMap.image !== null,
    hasNormalMap: false,
    hasSpecularMap: false,
    hasUvTransform: hasGlUvTransform(material !== null ? material.diffuseMap : null),
    lightingModel: 'lambert',
  };
}

const scratchRgba: LinearColor = [0, 0, 0, 0];
