import type { LinearColor } from '@flighthq/color';
import { unpackColorToLinear } from '@flighthq/color';
import { bindGlTexture } from '@flighthq/render-gl';
import type { GlRenderState, StandardPbrMaterialProperties, Texture } from '@flighthq/types';

import type { GlPbrDefineKey } from './glPbrPrelude';
import type { GlPbrProgram } from './glPbrProgramCache';

// The texture-unit assignment for the StandardPbrMaterialProperties block. Units 0–4 are reserved
// for the standard maps so every PBR program (StandardPbr and every extension) binds them at the
// same slots; extension renderers bind their own maps at GL_PBR_EXTENSION_TEXTURE_UNIT and above.
export const GL_PBR_BASE_COLOR_TEXTURE_UNIT = 0;
export const GL_PBR_NORMAL_TEXTURE_UNIT = 1;
export const GL_PBR_METALLIC_ROUGHNESS_TEXTURE_UNIT = 2;
export const GL_PBR_OCCLUSION_TEXTURE_UNIT = 3;
export const GL_PBR_EMISSIVE_TEXTURE_UNIT = 4;

// The first texture unit free for an extension's own maps (clearcoat, sheen, etc.), past the five
// standard-block units. Extension renderers number their maps from here.
export const GL_PBR_EXTENSION_TEXTURE_UNIT = 5;

// Uploads the full StandardPbrMaterialProperties block to a PBR program: the base-color/metallic/
// roughness/normal/occlusion/emissive scalars and colors, plus each present map bound at its fixed
// standard texture unit (0–4). StandardPbr passes the material itself (it IS a properties block);
// every extension renderer passes `material.standard`. A null block uploads neutral defaults (white
// base color, dielectric, fully rough) so a missing material renders plausibly. Packed colors are
// decoded to linear on the CPU here; sampled albedo/emissive textures are sRgb-decoded in GLSL, so
// nothing is double-decoded. The alpha-cutoff uniform is NOT part of the block — it lives on the
// SurfaceMaterial trailer, so each renderer uploads it from the material after this call. Call
// after beginGlMeshDraw has selected the program.
export function bindGlPbrStandardBlock(
  state: GlRenderState,
  program: Readonly<GlPbrProgram>,
  standard: Readonly<StandardPbrMaterialProperties> | null,
): void {
  const gl = state.gl;
  if (standard === null) {
    gl.uniform4f(program.locBaseColor, 1, 1, 1, 1);
    gl.uniform1f(program.locMetallic, 0);
    gl.uniform1f(program.locRoughness, 1);
    gl.uniform1f(program.locNormalScale, 1);
    gl.uniform3f(program.locEmissive, 0, 0, 0);
    gl.uniform1f(program.locEmissiveStrength, 1);
    gl.uniform1f(program.locOcclusionStrength, 1);
    return;
  }

  unpackColorToLinear(scratchRgba, standard.baseColor);
  gl.uniform4f(program.locBaseColor, scratchRgba[0], scratchRgba[1], scratchRgba[2], scratchRgba[3]);
  gl.uniform1f(program.locMetallic, standard.metallic);
  gl.uniform1f(program.locRoughness, standard.roughness);
  gl.uniform1f(program.locNormalScale, standard.normalScale);
  gl.uniform1f(program.locOcclusionStrength, standard.occlusionStrength);

  unpackColorToLinear(scratchRgba, standard.emissive);
  gl.uniform3f(program.locEmissive, scratchRgba[0], scratchRgba[1], scratchRgba[2]);
  gl.uniform1f(program.locEmissiveStrength, standard.emissiveStrength);

  bindGlPbrStandardTexture(state, standard.baseColorMap, program.locBaseColorMap, GL_PBR_BASE_COLOR_TEXTURE_UNIT);
  bindGlPbrStandardTexture(state, standard.normalMap, program.locNormalMap, GL_PBR_NORMAL_TEXTURE_UNIT);
  bindGlPbrStandardTexture(
    state,
    standard.metallicRoughnessMap,
    program.locMetallicRoughnessMap,
    GL_PBR_METALLIC_ROUGHNESS_TEXTURE_UNIT,
  );
  bindGlPbrStandardTexture(state, standard.occlusionMap, program.locOcclusionMap, GL_PBR_OCCLUSION_TEXTURE_UNIT);
  bindGlPbrStandardTexture(state, standard.emissiveMap, program.locEmissiveMap, GL_PBR_EMISSIVE_TEXTURE_UNIT);
}

// Binds one texture to a numbered unit and points its sampler uniform there, if the slot has
// pixels. The shared per-map helper for both the standard block and extension renderers (they pass
// their own unit ≥ GL_PBR_EXTENSION_TEXTURE_UNIT). No-op when the slot is empty, so the shader's
// untextured #ifdef branch governs instead.
export function bindGlPbrStandardTexture(
  state: GlRenderState,
  texture: Readonly<Texture> | null,
  location: WebGLUniformLocation | null,
  unit: number,
): void {
  if (!isGlTextureReady(texture)) return;
  const gl = state.gl;
  gl.activeTexture(gl.TEXTURE0 + unit);
  bindGlTexture(state, texture!.image!.source!);
  gl.uniform1i(location, unit);
}

// Builds a GlPbrDefineKey with the standard-block map flags from `standard` and the alpha-mask flag
// from the material's surface trailer, with every extension lobe disabled. Each extension renderer
// calls this and then ORs in its own extension flag; the StandardPbr renderer uses it as-is. Keeps
// the map-present test (isGlTextureReady) in one place so the compiled variant and the bound
// textures never disagree.
export function buildGlPbrStandardDefineKey(
  standard: Readonly<StandardPbrMaterialProperties> | null,
  alphaMaskEnabled: boolean,
): GlPbrDefineKey {
  return {
    alphaMaskEnabled,
    anisotropyEnabled: false,
    clearcoatEnabled: false,
    hasBaseColorMap: isGlTextureReady(standard?.baseColorMap ?? null),
    hasEmissiveMap: isGlTextureReady(standard?.emissiveMap ?? null),
    hasMetallicRoughnessMap: isGlTextureReady(standard?.metallicRoughnessMap ?? null),
    hasNormalMap: isGlTextureReady(standard?.normalMap ?? null),
    hasOcclusionMap: isGlTextureReady(standard?.occlusionMap ?? null),
    iridescenceEnabled: false,
    sheenEnabled: false,
    specularEnabled: false,
    subsurfaceEnabled: false,
    transmissionEnabled: false,
  };
}

// True when a texture slot has bound, uploadable pixels (an image resource with a backing source).
// The single predicate the define-key builder and the bind path share, so "map present" means the
// same thing in both places.
export function isGlTextureReady(texture: Readonly<Texture> | null): boolean {
  return texture !== null && texture.image !== null && texture.image.source !== null;
}

const scratchRgba: LinearColor = [0, 0, 0, 0];
