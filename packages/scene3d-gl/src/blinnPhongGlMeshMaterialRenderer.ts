import { unpackColorToLinear } from '@flighthq/color/contract';
import {
  registerGlBitmapTextureResolver,
  registerGlImageTextureResolver,
  resolveGlTexture,
} from '@flighthq/render-gl/contract';
import type {
  LinearColor,
  BlinnPhongMaterial,
  Camera3D,
  GlMeshMaterialRenderer,
  GlRenderState,
  Material,
  MeshGeometry,
  Scene3DLightBlock,
  Scene3DRenderProxy,
  GlClassicDefineKey,
  GlClassicProgram,
} from '@flighthq/types/contract';
import { BlinnPhongMaterialKind } from '@flighthq/types/contract';

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
import { isGlTextureReady } from './glPbrStandardBlock';
import { getGlScene3DRuntime } from './glScene3DRuntime';

// The built-in classic BlinnPhong forward-lit mesh-material renderer (GlMeshMaterialRenderer for
// BlinnPhongMaterialKind). Lambert diffuse plus a half-vector specular lobe (cheaper, smoother
// highlights than reflection-vector Phong): bind selects the classic uber-shader's `blinnphong`
// variant for the material's diffuse / specular / normal maps and alpha mode, uploads the camera
// view-projection AND position (the specular term is view-dependent), the packed light block, and the
// material's linear diffuse + specular colors, shininess, and maps. draw issues the indexed draw. See
// registerBlinnPhongGlMaterial to install it.
export const blinnPhongGlMeshMaterialRenderer: GlMeshMaterialRenderer = {
  bind(
    state: GlRenderState,
    material: Readonly<Material> | null,
    lights: Readonly<Scene3DLightBlock>,
    camera: Readonly<Camera3D>,
  ): void {
    const gl = state.gl;
    const blinnPhong = material as Readonly<BlinnPhongMaterial> | null;
    const program = ensureGlClassicProgram(state, defineKeyForMaterial(state, blinnPhong));
    beginGlMeshDraw(state, program, blinnPhong !== null && blinnPhong.doubleSided);

    setGlMeshViewProjection(state, program.locViewProjection, camera);
    setGlMeshCameraPosition(gl, program.locCameraPosition, camera);
    bindGlMeshLightBlock(state, program, lights);
    bindGlBlinnPhongMaterialUniforms(state, program, blinnPhong);
  },

  draw(state: GlRenderState, proxy: Readonly<Scene3DRenderProxy>, geometry: Readonly<MeshGeometry>): void {
    const program = getGlScene3DRuntime(state).activeMeshProgram;
    if (program === null) return;
    drawGlMeshSubset(state, program, proxy, geometry);
  },
};

// Registers the built-in BlinnPhong renderer for BlinnPhongMaterialKind on this state. Opt-in (no
// top-level side effect); call once per GlRenderState before drawScene3D so meshes with BlinnPhong
// materials draw.
export function registerBlinnPhongGlMaterial(state: GlRenderState): void {
  registerGlBitmapTextureResolver(state);
  registerGlImageTextureResolver(state);
  registerGlMeshMaterialRenderer(state, BlinnPhongMaterialKind, blinnPhongGlMeshMaterialRenderer);
}

function bindGlBlinnPhongMaterialUniforms(
  state: GlRenderState,
  program: Readonly<GlClassicProgram>,
  material: Readonly<BlinnPhongMaterial> | null,
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

  const alphaMap = material.alphaMap;
  if (alphaMap !== null) {
    gl.activeTexture(gl.TEXTURE3);
    if (resolveGlTexture(state, alphaMap) !== null) gl.uniform1i(program.locAlphaMap, 3);
  }

  bindGlUvTransform(gl, program, diffuseMap);
}

// The feature define key for a BlinnPhong material: the fixed `blinnphong` lighting model plus which
// optional maps are present and whether alpha-mask cutoff is active.
function defineKeyForMaterial(state: GlRenderState, material: Readonly<BlinnPhongMaterial> | null): GlClassicDefineKey {
  return {
    alphaMaskEnabled: material !== null && material.alphaMode === 'mask',
    // Match the bind's resolver readiness so the compiled HAS_ALPHA_MAP variant and bound texture
    // never disagree. Gated off 'opaque' — an opaque
    // material ignores coverage (SurfaceMaterial contract), so it must not sample the alpha map.
    hasAlphaMap: material !== null && material.alphaMode !== 'opaque' && isGlTextureReady(state, material.alphaMap),
    hasDiffuseMap: material !== null && isGlTextureReady(state, material.diffuseMap),
    hasNormalMap: material !== null && isGlTextureReady(state, material.normalMap),
    hasSpecularMap: material !== null && isGlTextureReady(state, material.specularMap),
    hasUvTransform: hasGlUvTransform(material !== null ? material.diffuseMap : null),
    lightingModel: 'blinnphong',
  };
}

const scratchRgba: LinearColor = [0, 0, 0, 0];
