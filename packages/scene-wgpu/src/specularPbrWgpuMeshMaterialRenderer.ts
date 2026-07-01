import type { LinearColor } from '@flighthq/materials';
import { unpackColorToLinear } from '@flighthq/materials';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu';
import type {
  Camera,
  Material,
  MeshGeometry,
  SceneLightBlock,
  SceneRenderProxy,
  SpecularPbrMaterial,
  WgpuMeshMaterialRenderer,
  WgpuRenderState,
} from '@flighthq/types';
import { SpecularPbrMaterialKind } from '@flighthq/types';

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

// The built-in Specular (KHR_materials_specular) forward-lit mesh-material renderer — the WGSL mirror
// of specularPbrGlMeshMaterialRenderer. This extension gives independent control of a dielectric's
// specular reflection: `specular` scales the base reflectance and `specularColor` tints F0, letting a
// surface be more or less reflective than the fixed 0.04 dielectric default without changing its diffuse
// albedo (metals keep their albedo-tinted F0). The shader recomputes F0 = mix(min(0.04 * specularColor,
// 1) * specular, albedo, metallic) behind `const SPECULAR_EXT`. bind builds the standard define key from
// `material.standard` + the surface trailer, sets the SPECULAR_EXT flag, selects/compiles that pipeline
// variant for the current color format, writes the shared Frame uniform, then writes the base block +
// the specular scale / linear-decoded specularColor into the one MaterialBlock uniform and binds it at
// group(2). The specular strength/color maps are reserved but NOT sampled on wgpu yet (maps deferred).
// See registerSpecularPbrWgpuMaterial.
export const specularPbrWgpuMeshMaterialRenderer: WgpuMeshMaterialRenderer = {
  bind(
    state: WgpuRenderState,
    material: Readonly<Material> | null,
    lights: Readonly<SceneLightBlock>,
    camera: Readonly<Camera>,
  ): void {
    const stateRuntime = getWgpuRenderStateRuntime(state);
    const pass = stateRuntime.renderPass;
    if (pass === null) return;

    const specular = material as Readonly<SpecularPbrMaterial> | null;
    const standard = specular !== null ? specular.standard : null;
    const key = buildWgpuPbrStandardDefineKey(standard, specular);
    key.specularEnabled = true;
    const format = stateRuntime.currentColorFormat ?? state.format;
    const pipeline = ensureWgpuPbrPipeline(state, key, format);

    writeWgpuFrameUniform(state, camera, lights);
    const binding = ensureWgpuPbrMaterialBindGroup(state, pipeline, specular ?? FALLBACK_MATERIAL, standard);
    const out = getWgpuPbrMaterialScratch();
    writeWgpuPbrStandardBlock(out, standard, specular !== null ? specular.alphaCutoff : 0.5);
    out.fill(0, 16);
    // specular group (floats 32..35): specular scale, specularColor.rgb (linear).
    if (specular !== null) {
      unpackColorToLinear(_colorScratch, specular.specularColor);
      out[32] = specular.specular;
      out[33] = _colorScratch[0];
      out[34] = _colorScratch[1];
      out[35] = _colorScratch[2];
    } else {
      out[32] = 1;
      out[33] = 1;
      out[34] = 1;
      out[35] = 1;
    }
    writeWgpuPbrMaterialUniform(state, binding);

    beginWgpuMeshDraw(state, pipeline);
    pass.setBindGroup(2, binding.bindGroup);
  },

  draw(state: WgpuRenderState, proxy: Readonly<SceneRenderProxy>, geometry: Readonly<MeshGeometry>): void {
    drawWgpuMeshSubset(state, proxy, geometry);
  },
};

// Installs the built-in Specular renderer for SpecularPbrMaterialKind on this state. Opt-in (no
// top-level side effect): drawScene only draws Specular subsets once this is called.
export function registerSpecularPbrWgpuMaterial(state: WgpuRenderState): void {
  registerWgpuMeshMaterialRenderer(state, SpecularPbrMaterialKind, specularPbrWgpuMeshMaterialRenderer);
}

const FALLBACK_MATERIAL = {} as Readonly<SpecularPbrMaterial>;
const _colorScratch: LinearColor = [0, 0, 0, 0];
