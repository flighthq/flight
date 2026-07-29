import { unpackColorToLinear } from '@flighthq/color/contract';
import { registerGlBitmapTextureResolver, registerGlImageTextureResolver } from '@flighthq/render-gl/contract';
import type {
  LinearColor,
  Camera3D,
  GlMeshMaterialRenderer,
  GlRenderState,
  Material,
  MeshGeometry,
  Scene3DLightBlock,
  Scene3DRenderProxy,
  SpecularPbrMaterial,
} from '@flighthq/types/contract';
import { SpecularPbrMaterialKind } from '@flighthq/types/contract';

import { bindGlMeshLightBlock } from './glLitProgram';
import { registerGlMeshMaterialRenderer } from './glMeshMaterialRegistry';
import { beginGlMeshDraw, drawGlMeshSubset, setGlMeshCameraPosition, setGlMeshViewProjection } from './glMeshProgram';
import { ensureGlPbrProgram } from './glPbrProgramCache';
import { bindGlPbrStandardBlock, buildGlPbrStandardDefineKey } from './glPbrStandardBlock';
import { getGlScene3DRuntime } from './glScene3DRuntime';

// The built-in Specular (KHR_materials_specular) forward-lit mesh-material renderer. This extension
// gives independent control of a dielectric's specular reflection: `specular` scales the base
// reflectance and `specularColor` tints F0, letting a surface be more or less reflective than the
// fixed 0.04 dielectric default without changing its diffuse albedo (metals keep their albedo-tinted
// F0). The shader recomputes F0 = mix(min(0.04 * specularColor, 1) * specular, albedo, metallic)
// behind `#define SPECULAR_EXT`. bind composes the material's `standard` block through the shared
// bindGlPbrStandardBlock and uploads the specular scale + linear-decoded specularColor. The specular
// strength/color maps are reserved by the descriptor but not yet sampled. See
// registerSpecularPbrGlMaterial.
export const specularPbrGlMeshMaterialRenderer: GlMeshMaterialRenderer = {
  bind(
    state: GlRenderState,
    material: Readonly<Material> | null,
    lights: Readonly<Scene3DLightBlock>,
    camera: Readonly<Camera3D>,
  ): void {
    const gl = state.gl;
    const specular = material as Readonly<SpecularPbrMaterial> | null;
    const standard = specular !== null ? specular.standard : null;
    const key = buildGlPbrStandardDefineKey(state, standard, specular);
    key.specularEnabled = true;
    const program = ensureGlPbrProgram(state, key);
    beginGlMeshDraw(state, program, specular !== null && specular.doubleSided);

    setGlMeshViewProjection(state, program.locViewProjection, camera);
    setGlMeshCameraPosition(gl, program.locCameraPosition, camera);
    bindGlMeshLightBlock(state, program, lights);
    bindGlPbrStandardBlock(state, program, standard);
    gl.uniform1f(program.locAlphaCutoff, specular !== null ? specular.alphaCutoff : 0.5);

    if (specular !== null) {
      unpackColorToLinear(scratchRgba, specular.specularColor);
      gl.uniform1f(program.locSpecular, specular.specular);
      gl.uniform3f(program.locSpecularColor, scratchRgba[0], scratchRgba[1], scratchRgba[2]);
    } else {
      gl.uniform1f(program.locSpecular, 1);
      gl.uniform3f(program.locSpecularColor, 1, 1, 1);
    }
  },

  draw(state: GlRenderState, proxy: Readonly<Scene3DRenderProxy>, geometry: Readonly<MeshGeometry>): void {
    const program = getGlScene3DRuntime(state).activeMeshProgram;
    if (program === null) return;
    drawGlMeshSubset(state, program, proxy, geometry);
  },
};

// Installs the built-in Specular renderer for SpecularPbrMaterialKind on this state. Opt-in (no
// top-level side effect): drawScene3D only draws Specular subsets once this is called.
export function registerSpecularPbrGlMaterial(state: GlRenderState): void {
  registerGlBitmapTextureResolver(state);
  registerGlImageTextureResolver(state);
  registerGlMeshMaterialRenderer(state, SpecularPbrMaterialKind, specularPbrGlMeshMaterialRenderer);
}

const scratchRgba: LinearColor = [0, 0, 0, 0];
