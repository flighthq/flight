import type { LinearColor } from '@flighthq/materials';
import { unpackColorToLinear } from '@flighthq/materials';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu';
import type {
  Camera,
  Material,
  MeshGeometry,
  SceneLightBlock,
  SceneRenderProxy,
  SpecularGlossinessPbrMaterial,
  StandardPbrMaterialProperties,
  WgpuMeshMaterialRenderer,
  WgpuRenderState,
} from '@flighthq/types';
import { SpecularGlossinessPbrMaterialKind } from '@flighthq/types';

import {
  buildWgpuPbrStandardDefineKey,
  ensureWgpuPbrMaterialBindGroup,
  getWgpuPbrMaterialScratch,
  writeWgpuPbrMaterialUniform,
  writeWgpuPbrStandardBlock,
} from './standardPbrWgpuMeshMaterialRenderer';
import { registerWgpuMeshMaterialRenderer } from './wgpuMeshMaterialRegistry';
import { beginWgpuMeshDraw, drawWgpuMeshSubset, writeWgpuFrameUniform } from './wgpuMeshPipeline';
import { ensureWgpuPbrPipeline } from './wgpuPbrPipelineCache';

// The built-in SpecularGlossiness forward-lit mesh-material renderer (legacy KHR_materials_
// pbrSpecularGlossiness workflow) — the WGSL mirror of specularGlossinessPbrGlMeshMaterialRenderer.
// There is no spec-gloss path in the shader: this renderer converts the material to a
// StandardPbrMaterialProperties block on the CPU at bind time and drives the SAME base PBR program (no
// extension flag), so spec-gloss assets render through the one metallic-roughness uber-shader.
//
// CONVERSION (Khronos glTF spec-gloss → metallic-roughness):
//   - roughness  = 1 - glossiness  (glossiness is the inverse of roughness)
//   - metallic   = solveMetallic(diffuseBrightness, specularBrightness): the quadratic that recovers
//                  the metallic factor from how far the specular reflectance sits above the 0.04
//                  dielectric floor. Fully dielectric specular → 0; albedo-bright specular → 1.
//   - baseColor  = lerp from the dielectric estimate (diffuse / (1 - 0.04)) toward the specular color
//                  by metallic, so a dielectric keeps its diffuse albedo and a conductor takes its
//                  specular tint as F0.
// The conversion is an approximation — spec-gloss can express specular tints a single metallic-
// roughness baseColor cannot reproduce exactly — but it matches the reference converter and is stable
// for typical assets. The specularGlossinessMap is NOT remapped to a metallic-roughness map here
// (different packing) and maps are not sampled on wgpu yet regardless; only the scalar conversion is
// applied, while diffuse/emissive/normal/occlusion maps pass straight through to the standard block
// (reserved, NOT sampled on wgpu yet — maps deferred).
//
// Colors are decoded to linear on the CPU before the conversion math; the converted standard block
// re-packs baseColor/emissive to RGBA8 so writeWgpuPbrStandardBlock's CPU decode round-trips. See
// registerSpecularGlossinessPbrWgpuMaterial.
export const specularGlossinessPbrWgpuMeshMaterialRenderer: WgpuMeshMaterialRenderer = {
  bind(
    state: WgpuRenderState,
    material: Readonly<Material> | null,
    lights: Readonly<SceneLightBlock>,
    camera: Readonly<Camera>,
  ): void {
    const stateRuntime = getWgpuRenderStateRuntime(state);
    const pass = stateRuntime.renderPass;
    if (pass === null) return;

    const specGloss = material as Readonly<SpecularGlossinessPbrMaterial> | null;
    const standard = specGloss !== null ? convertSpecularGlossinessToStandard(specGloss) : null;
    const key = buildWgpuPbrStandardDefineKey(standard, specGloss);
    const format = stateRuntime.currentColorFormat ?? state.format;
    const pipeline = ensureWgpuPbrPipeline(state, key, format);

    writeWgpuFrameUniform(state, camera, lights);
    const binding = ensureWgpuPbrMaterialBindGroup(state, pipeline, specGloss ?? FALLBACK_MATERIAL, standard);
    const out = getWgpuPbrMaterialScratch();
    writeWgpuPbrStandardBlock(out, standard, specGloss !== null ? specGloss.alphaCutoff : 0.5);
    out.fill(0, 16);
    writeWgpuPbrMaterialUniform(state, binding);

    beginWgpuMeshDraw(state, pipeline);
    pass.setBindGroup(2, binding.bindGroup);
  },

  draw(state: WgpuRenderState, proxy: Readonly<SceneRenderProxy>, geometry: Readonly<MeshGeometry>): void {
    drawWgpuMeshSubset(state, proxy, geometry);
  },
};

// Installs the built-in SpecularGlossiness renderer for SpecularGlossinessPbrMaterialKind on this
// state. Opt-in (no top-level side effect): drawScene only draws SpecularGlossiness subsets once this
// is called.
export function registerSpecularGlossinessPbrWgpuMaterial(state: WgpuRenderState): void {
  registerWgpuMeshMaterialRenderer(
    state,
    SpecularGlossinessPbrMaterialKind,
    specularGlossinessPbrWgpuMeshMaterialRenderer,
  );
}

// Builds a StandardPbrMaterialProperties block from a spec-gloss material via the Khronos reference
// conversion. Writes a packed RGBA baseColor/emissive (writeWgpuPbrStandardBlock re-decodes them), so
// the downstream standard-block path stays identical to a native StandardPbr material. The returned
// object is a fresh per-bind block (not pooled) — bind is not a hot inner loop, and reusing a scratch
// block would alias across draws. Mirrors scene-gl's convertSpecularGlossinessToStandard.
function convertSpecularGlossinessToStandard(
  material: Readonly<SpecularGlossinessPbrMaterial>,
): StandardPbrMaterialProperties {
  unpackColorToLinear(_diffuseScratch, material.diffuse);
  unpackColorToLinear(_specularScratch, material.specular);

  const specularBrightness = Math.max(_specularScratch[0], _specularScratch[1], _specularScratch[2]);
  const oneMinusSpecularStrength = 1 - specularBrightness;
  const diffuseBrightness = Math.max(_diffuseScratch[0], _diffuseScratch[1], _diffuseScratch[2]);
  const metallic = solveMetallic(diffuseBrightness, specularBrightness, oneMinusSpecularStrength);

  // baseColor: blend the dielectric diffuse estimate and the specular tint by metallic, per the
  // reference converter, then re-pack to RGBA8 for the standard block to decode.
  const denom = Math.max(1 - DIELECTRIC_SPECULAR, 1e-4);
  const r = lerp((_diffuseScratch[0] * oneMinusSpecularStrength) / denom, _specularScratch[0], metallic);
  const g = lerp((_diffuseScratch[1] * oneMinusSpecularStrength) / denom, _specularScratch[1], metallic);
  const b = lerp((_diffuseScratch[2] * oneMinusSpecularStrength) / denom, _specularScratch[2], metallic);

  return {
    baseColor: packLinearRgba(r, g, b, _diffuseScratch[3]),
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

// The Khronos spec-gloss → metallic solver: recovers the metallic factor from the diffuse and specular
// reflectances by solving the quadratic that the metallic-roughness F0 model implies. Below the 0.04
// dielectric floor the surface is fully dielectric (metallic 0).
function solveMetallic(diffuse: number, specular: number, oneMinusSpecularStrength: number): number {
  if (specular < DIELECTRIC_SPECULAR) return 0;
  const a = DIELECTRIC_SPECULAR;
  const b = (diffuse * oneMinusSpecularStrength) / (1 - DIELECTRIC_SPECULAR) + specular - 2 * DIELECTRIC_SPECULAR;
  const c = DIELECTRIC_SPECULAR - specular;
  const discriminant = Math.max(b * b - 4 * a * c, 0);
  return Math.min(Math.max((-b + Math.sqrt(discriminant)) / (2 * a), 0), 1);
}

const DIELECTRIC_SPECULAR = 0.04;
const FALLBACK_MATERIAL = {} as Readonly<SpecularGlossinessPbrMaterial>;
const _diffuseScratch: LinearColor = [0, 0, 0, 0];
const _specularScratch: LinearColor = [0, 0, 0, 0];
