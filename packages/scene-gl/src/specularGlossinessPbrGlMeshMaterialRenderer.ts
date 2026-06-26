import type { LinearColor } from '@flighthq/materials';
import { unpackColorToLinear } from '@flighthq/materials';
import type {
  Camera,
  GlMeshMaterialRenderer,
  GlRenderState,
  Material,
  MeshGeometry,
  SceneLightBlock,
  SceneRenderProxy,
  SpecularGlossinessPbrMaterial,
  StandardPbrMaterialProperties,
} from '@flighthq/types';
import { SpecularGlossinessPbrMaterialKind } from '@flighthq/types';

import { bindGlMeshLightBlock } from './glLitProgram';
import { registerGlMeshMaterialRenderer } from './glMeshMaterialRegistry';
import { beginGlMeshDraw, drawGlMeshSubset, setGlMeshCameraPosition, setGlMeshViewProjection } from './glMeshProgram';
import { ensureGlPbrProgram } from './glPbrProgramCache';
import { bindGlPbrStandardBlock, buildGlPbrStandardDefineKey } from './glPbrStandardBlock';
import { getGlSceneRuntime } from './glSceneRuntime';

// The built-in SpecularGlossiness forward-lit mesh-material renderer (legacy KHR_materials_
// pbrSpecularGlossiness workflow). There is no spec-gloss path in the shader: this renderer converts
// the material to a StandardPbrMaterialProperties block on the CPU at bind time and drives the SAME
// base PBR program (no extension define), so spec-gloss assets render through the one metallic-
// roughness uber-shader.
//
// CONVERSION (Khronos glTF spec-gloss → metallic-roughness, `convertSpecularGlossinessToMetallic`):
//   - roughness  = 1 - glossiness  (glossiness is the inverse of roughness)
//   - metallic   = solveMetallic(diffuseBrightness, specularBrightness): the quadratic that recovers
//                  the metallic factor from how far the specular reflectance sits above the 0.04
//                  dielectric floor. Fully dielectric specular → 0; albedo-bright specular → 1.
//   - baseColor  = lerp from the dielectric estimate (diffuse / (1 - 0.04)) toward the specular color
//                  by metallic, so a dielectric keeps its diffuse albedo and a conductor takes its
//                  specular tint as F0.
// The conversion is an approximation — spec-gloss can express specular tints a single metallic-
// roughness baseColor cannot reproduce exactly — but it matches the reference converter and is
// stable for typical assets. The specularGlossinessMap (specular RGB + glossiness A) is NOT remapped
// to a metallic-roughness map here (different packing); only the scalar conversion is applied, while
// diffuse/emissive/normal/occlusion maps pass straight through to the standard block.
//
// Colors are decoded to linear on the CPU before the conversion math; sampled albedo/emissive
// textures are sRgb-decoded in GLSL, so nothing is double-decoded. See
// registerSpecularGlossinessPbrGlMaterial.
export const specularGlossinessPbrGlMeshMaterialRenderer: GlMeshMaterialRenderer = {
  bind(
    state: GlRenderState,
    material: Readonly<Material> | null,
    lights: Readonly<SceneLightBlock>,
    camera: Readonly<Camera>,
  ): void {
    const gl = state.gl;
    const specGloss = material as Readonly<SpecularGlossinessPbrMaterial> | null;
    const standard = specGloss !== null ? convertSpecularGlossinessToStandard(specGloss) : null;
    const program = ensureGlPbrProgram(
      state,
      buildGlPbrStandardDefineKey(standard, specGloss !== null && specGloss.alphaMode === 'mask'),
    );
    beginGlMeshDraw(state, program, specGloss !== null && specGloss.doubleSided);

    setGlMeshViewProjection(gl, program.locViewProjection, camera);
    setGlMeshCameraPosition(gl, program.locCameraPosition, camera);
    bindGlMeshLightBlock(state, program, lights);
    bindGlPbrStandardBlock(state, program, standard);
    gl.uniform1f(program.locAlphaCutoff, specGloss !== null ? specGloss.alphaCutoff : 0.5);
  },

  draw(state: GlRenderState, proxy: Readonly<SceneRenderProxy>, geometry: Readonly<MeshGeometry>): void {
    const program = getGlSceneRuntime(state).activeMeshProgram;
    if (program === null) return;
    drawGlMeshSubset(state, program, proxy, geometry);
  },
};

// Installs the built-in SpecularGlossiness renderer for SpecularGlossinessPbrMaterialKind on this
// state. Opt-in (no top-level side effect): drawScene only draws SpecularGlossiness subsets once
// this is called.
export function registerSpecularGlossinessPbrGlMaterial(state: GlRenderState): void {
  registerGlMeshMaterialRenderer(state, SpecularGlossinessPbrMaterialKind, specularGlossinessPbrGlMeshMaterialRenderer);
}

// Builds a StandardPbrMaterialProperties block from a spec-gloss material via the Khronos reference
// conversion. Writes a packed RGBA baseColor/emissive (the standard block re-decodes them), so the
// downstream bindGlPbrStandardBlock path stays identical to a native StandardPbr material. The
// returned object is a fresh per-bind block (not pooled) — bind is not a hot inner loop, and reusing
// a scratch block would alias across draws.
function convertSpecularGlossinessToStandard(
  material: Readonly<SpecularGlossinessPbrMaterial>,
): StandardPbrMaterialProperties {
  unpackColorToLinear(scratchDiffuse, material.diffuse);
  unpackColorToLinear(scratchSpecular, material.specular);

  const specularBrightness = Math.max(scratchSpecular[0], scratchSpecular[1], scratchSpecular[2]);
  const oneMinusSpecularStrength = 1 - specularBrightness;
  const diffuseBrightness = Math.max(scratchDiffuse[0], scratchDiffuse[1], scratchDiffuse[2]);
  const metallic = solveMetallic(diffuseBrightness, specularBrightness, oneMinusSpecularStrength);

  // baseColor: blend the dielectric diffuse estimate and the specular tint by metallic, per the
  // reference converter, then re-pack to RGBA8 for the standard block to decode.
  const denom = Math.max(1 - DIELECTRIC_SPECULAR, 1e-4);
  const r = lerp((scratchDiffuse[0] * oneMinusSpecularStrength) / denom, scratchSpecular[0], metallic);
  const g = lerp((scratchDiffuse[1] * oneMinusSpecularStrength) / denom, scratchSpecular[1], metallic);
  const b = lerp((scratchDiffuse[2] * oneMinusSpecularStrength) / denom, scratchSpecular[2], metallic);

  return {
    baseColor: packLinearRgba(r, g, b, scratchDiffuse[3]),
    baseColorMap: material.diffuseMap,
    emissive: material.emissive,
    emissiveMap: material.emissiveMap,
    emissiveStrength: material.emissiveStrength,
    metallic,
    metallicRoughnessMap: null,
    normalMap: material.normalMap,
    normalScale: material.normalScale,
    occlusionMap: material.occlusionMap,
    occlusionStrength: material.occlusionStrength,
    roughness: 1 - material.glossiness,
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// Re-encodes a linear RGBA color (components in [0,1]) back to a packed 0xRRGGBBAA integer with the
// sRgb transfer, the inverse of unpackColorToLinear, so the standard block's CPU decode round-trips.
function packLinearRgba(r: number, g: number, b: number, a: number): number {
  const toByte = (linear: number): number => {
    const clamped = Math.min(Math.max(linear, 0), 1);
    const srgb = clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
    return Math.round(srgb * 255) & 0xff;
  };
  const alpha = Math.round(Math.min(Math.max(a, 0), 1) * 255) & 0xff;
  return ((toByte(r) << 24) | (toByte(g) << 16) | (toByte(b) << 8) | alpha) >>> 0;
}

// The Khronos spec-gloss → metallic solver: recovers the metallic factor from the diffuse and
// specular reflectances by solving the quadratic that the metallic-roughness F0 model implies. Below
// the 0.04 dielectric floor the surface is fully dielectric (metallic 0).
function solveMetallic(diffuse: number, specular: number, oneMinusSpecularStrength: number): number {
  if (specular < DIELECTRIC_SPECULAR) return 0;
  const a = DIELECTRIC_SPECULAR;
  const b = (diffuse * oneMinusSpecularStrength) / (1 - DIELECTRIC_SPECULAR) + specular - 2 * DIELECTRIC_SPECULAR;
  const c = DIELECTRIC_SPECULAR - specular;
  const discriminant = Math.max(b * b - 4 * a * c, 0);
  return Math.min(Math.max((-b + Math.sqrt(discriminant)) / (2 * a), 0), 1);
}

const DIELECTRIC_SPECULAR = 0.04;
const scratchDiffuse: LinearColor = [0, 0, 0, 0];
const scratchSpecular: LinearColor = [0, 0, 0, 0];
