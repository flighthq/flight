import { unpackColorToLinear } from '@flighthq/color/contract';
import { resolveGlTexture } from '@flighthq/render-gl/contract';
import type {
  LinearColor,
  Camera3D,
  GlMeshMaterialRenderer,
  GlRenderState,
  Material,
  MeshGeometry,
  PhongMaterial,
  Scene3DLightBlock,
  Scene3DRenderProxy,
  GlClassicDefineKey,
  GlClassicProgram,
} from '@flighthq/types/contract';
import { PhongMaterialKind } from '@flighthq/types/contract';

import { ensureGlClassicProgram } from './glClassicPrelude';
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
import { getGlScene3DRuntime } from './glScene3DRuntime';

// The built-in classic Phong forward-lit mesh-material renderer (GlMeshMaterialRenderer for
// PhongMaterialKind). Lambert diffuse plus a reflection-vector specular lobe: bind selects the classic
// uber-shader's `phong` variant for the material's diffuse / specular / normal maps and alpha mode,
// uploads the camera view-projection AND position (the specular term is view-dependent), the packed
// light block, and the material's linear diffuse + specular colors, shininess, and maps. draw issues
// the indexed draw. See registerGlPhongMaterial to install it.
export const phongGlMeshMaterialRenderer: GlMeshMaterialRenderer = {
  bind(
    state: GlRenderState,
    material: Readonly<Material> | null,
    lights: Readonly<Scene3DLightBlock>,
    camera: Readonly<Camera3D>,
  ): void {
    const gl = state.gl;
    const phong = material as Readonly<PhongMaterial> | null;
    const program = ensureGlClassicProgram(state, defineKeyForMaterial(state, phong));
    beginGlMeshDraw(state, program, phong !== null && phong.doubleSided);

    setGlMeshViewProjection(state, program.locViewProjection, camera);
    setGlMeshCameraPosition(gl, program.locCameraPosition, camera);
    bindGlMeshLightBlock(state, program, lights);
    bindGlPhongMaterialUniforms(state, program, phong);
  },

  draw(state: GlRenderState, proxy: Readonly<Scene3DRenderProxy>, geometry: Readonly<MeshGeometry>): void {
    const program = getGlScene3DRuntime(state).activeMeshProgram;
    if (program === null) return;
    drawGlMeshSubset(state, program, proxy, geometry);
  },
};

// Registers the built-in Phong renderer for PhongMaterialKind on this state. Opt-in (no top-level
// side effect); call once per GlRenderState before drawScene3D so meshes with PhongMaterials draw.
export function registerGlPhongMaterial(state: GlRenderState): void {
  registerGlMeshMaterialRenderer(state, PhongMaterialKind, phongGlMeshMaterialRenderer);
}

function bindGlPhongMaterialUniforms(
  state: GlRenderState,
  program: Readonly<GlClassicProgram>,
  material: Readonly<PhongMaterial> | null,
): void {
  const gl = state.gl;
  if (material === null) {
    gl.uniform4f(program.locDiffuse, 1, 1, 1, 1);
    gl.uniform4f(program.locSpecular, 1, 1, 1, 1);
    gl.uniform1f(program.locShininess, 32);
    gl.uniform1f(program.locNormalScale, 1);
    gl.uniform1f(program.locAlphaCutoff, 0.5);
    return;
  }

  unpackColorToLinear(scratchRgba, material.diffuse);
  gl.uniform4f(program.locDiffuse, scratchRgba[0], scratchRgba[1], scratchRgba[2], scratchRgba[3]);
  unpackColorToLinear(scratchRgba, material.specular);
  gl.uniform4f(program.locSpecular, scratchRgba[0], scratchRgba[1], scratchRgba[2], scratchRgba[3]);
  gl.uniform1f(program.locShininess, material.shininess);
  gl.uniform1f(program.locNormalScale, material.normalScale);
  gl.uniform1f(program.locAlphaCutoff, material.alphaCutoff);

  const diffuseMap = material.diffuseMap;
  if (diffuseMap !== null) {
    gl.activeTexture(gl.TEXTURE0);
    if (resolveGlTexture(state, diffuseMap) !== null) gl.uniform1i(program.locDiffuseMap, 0);
  }

  const specularMap = material.specularMap;
  if (specularMap !== null) {
    gl.activeTexture(gl.TEXTURE1);
    if (resolveGlTexture(state, specularMap) !== null) gl.uniform1i(program.locSpecularMap, 1);
  }

  const normalMap = material.normalMap;
  if (normalMap !== null) {
    gl.activeTexture(gl.TEXTURE2);
    if (resolveGlTexture(state, normalMap) !== null) gl.uniform1i(program.locNormalMap, 2);
  }

  bindGlUvTransform(gl, program, diffuseMap);
}

// The feature define key for a Phong material: the fixed `phong` lighting model plus which optional
// maps are present and whether alpha-mask cutoff is active.
function defineKeyForMaterial(state: GlRenderState, material: Readonly<PhongMaterial> | null): GlClassicDefineKey {
  return {
    alphaMaskEnabled: material !== null && material.alphaMode === 'mask',
    hasAlphaMap: false,
    hasDiffuseMap:
      material !== null && material.diffuseMap !== null && resolveGlTexture(state, material.diffuseMap) !== null,
    hasNormalMap:
      material !== null && material.normalMap !== null && resolveGlTexture(state, material.normalMap) !== null,
    hasSpecularMap:
      material !== null && material.specularMap !== null && resolveGlTexture(state, material.specularMap) !== null,
    hasUvTransform: hasGlUvTransform(material !== null ? material.diffuseMap : null),
    lightingModel: 'phong',
  };
}

const scratchRgba: LinearColor = [0, 0, 0, 0];
