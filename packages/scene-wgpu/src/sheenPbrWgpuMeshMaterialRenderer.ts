import type { LinearColor } from '@flighthq/color';
import { unpackColorToLinear } from '@flighthq/color';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu';
import type {
  Camera,
  Material,
  MeshGeometry,
  SceneLightBlock,
  SceneRenderProxy,
  SheenPbrMaterial,
  WgpuMeshMaterialRenderer,
  WgpuRenderState,
} from '@flighthq/types';
import { SheenPbrMaterialKind } from '@flighthq/types';

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

// The built-in Sheen (KHR_materials_sheen) forward-lit mesh-material renderer — the WGSL mirror of
// sheenPbrGlMeshMaterialRenderer. Sheen adds a retroreflective Charlie ("inverted GGX") lobe on top of
// the base specular — the soft grazing-angle glow of velvet, satin, and other cloth — tinted by
// `sheenColor` and widened by `sheenRoughness`. bind builds the standard define key from
// `material.standard` + the surface trailer, sets the SHEEN flag, selects/compiles that pipeline
// variant for the current color format, writes the shared Frame uniform, then writes the base block +
// the sheen color/roughness into the one MaterialBlock uniform and binds it at group(2). The lobe lives
// behind `const SHEEN` in the PBR uber-shader. The packed sRgb `sheenColor` is decoded to linear on the
// CPU (unpackColorToLinear), matching the linear HDR radiance output. The sheen maps are reserved by the
// descriptor but NOT sampled on wgpu yet (maps deferred). See registerSheenPbrWgpuMaterial.
export const sheenPbrWgpuMeshMaterialRenderer: WgpuMeshMaterialRenderer = {
  bind(
    state: WgpuRenderState,
    material: Readonly<Material> | null,
    lights: Readonly<SceneLightBlock>,
    camera: Readonly<Camera>,
  ): void {
    const stateRuntime = getWgpuRenderStateRuntime(state);
    const pass = stateRuntime.renderPass;
    if (pass === null) return;

    const sheen = material as Readonly<SheenPbrMaterial> | null;
    const standard = sheen !== null ? sheen.standard : null;
    const key = buildWgpuPbrStandardDefineKey(standard, sheen);
    key.sheenEnabled = true;
    const format = stateRuntime.currentColorFormat ?? state.format;
    const pipeline = ensureWgpuPbrPipeline(state, key, format);

    writeWgpuFrameUniform(state, camera, lights);
    const binding = ensureWgpuPbrMaterialBindGroup(state, pipeline, sheen ?? FALLBACK_MATERIAL, standard);
    const out = getWgpuPbrMaterialScratch();
    writeWgpuPbrStandardBlock(out, standard, sheen !== null ? sheen.alphaCutoff : 0.5);
    out.fill(0, 16);
    // sheen group (floats 20..23): sheenColor.rgb (linear), sheenRoughness.
    if (sheen !== null) {
      unpackColorToLinear(_colorScratch, sheen.sheenColor);
      out[20] = _colorScratch[0];
      out[21] = _colorScratch[1];
      out[22] = _colorScratch[2];
      out[23] = sheen.sheenRoughness;
    }
    writeWgpuPbrMaterialUniform(state, binding);

    beginWgpuMeshDraw(state, pipeline);
    pass.setBindGroup(2, binding.bindGroup);
  },

  draw(state: WgpuRenderState, proxy: Readonly<SceneRenderProxy>, geometry: Readonly<MeshGeometry>): void {
    drawWgpuMeshSubset(state, proxy, geometry);
  },
};

// Installs the built-in Sheen renderer for SheenPbrMaterialKind on this state. Opt-in (no top-level
// side effect): drawScene only draws Sheen subsets once this is called.
export function registerSheenPbrWgpuMaterial(state: WgpuRenderState): void {
  registerWgpuMeshMaterialRenderer(state, SheenPbrMaterialKind, sheenPbrWgpuMeshMaterialRenderer);
}

const FALLBACK_MATERIAL = {} as Readonly<SheenPbrMaterial>;
const _colorScratch: LinearColor = [0, 0, 0, 0];
