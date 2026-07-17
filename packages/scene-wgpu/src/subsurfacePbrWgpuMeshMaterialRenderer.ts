import type { LinearColor } from '@flighthq/color';
import { unpackColorToLinear } from '@flighthq/color';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu';
import type {
  Camera,
  Material,
  MeshGeometry,
  SceneLightBlock,
  SceneRenderProxy,
  SubsurfacePbrMaterial,
  WgpuMeshMaterialRenderer,
  WgpuRenderState,
} from '@flighthq/types';
import { SubsurfacePbrMaterialKind } from '@flighthq/types';

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

// The built-in Subsurface forward-lit mesh-material renderer (Flight extension; flagged non-interop —
// there is no glTF equivalent) — the WGSL mirror of subsurfacePbrGlMeshMaterialRenderer. It
// approximates subsurface scattering with a wrapped-diffuse term: light wrapping past the terminator
// re-emerges tinted by `subsurfaceColor`, scaled by `subsurface` strength and inversely by `thickness`
// (thinner material = more translucency). This is a cheap stand-in for true diffusion-profile SSS —
// plausible for skin, wax, marble, foliage at forward-pass cost — and lives behind `const SUBSURFACE` in
// the PBR uber-shader. bind builds the standard define key from `material.standard` + the surface
// trailer, sets the SUBSURFACE flag, selects/compiles that pipeline variant for the current color
// format, writes the shared Frame uniform, then writes the base block + the subsurface scalars /
// linear-decoded subsurfaceColor into the one MaterialBlock uniform and binds it at group(2). The
// subsurface/thickness maps are reserved but NOT sampled on wgpu yet (maps deferred). See
// registerSubsurfacePbrWgpuMaterial.
export const subsurfacePbrWgpuMeshMaterialRenderer: WgpuMeshMaterialRenderer = {
  bind(
    state: WgpuRenderState,
    material: Readonly<Material> | null,
    lights: Readonly<SceneLightBlock>,
    camera: Readonly<Camera>,
  ): void {
    const stateRuntime = getWgpuRenderStateRuntime(state);
    const pass = stateRuntime.renderPass;
    if (pass === null) return;

    const subsurface = material as Readonly<SubsurfacePbrMaterial> | null;
    const standard = subsurface !== null ? subsurface.standard : null;
    const key = buildWgpuPbrStandardDefineKey(standard, subsurface);
    key.subsurfaceEnabled = true;
    const format = stateRuntime.currentColorFormat ?? state.format;
    const pipeline = ensureWgpuPbrPipeline(state, key, format);

    writeWgpuFrameUniform(state, camera, lights);
    const binding = ensureWgpuPbrMaterialBindGroup(state, pipeline, subsurface ?? FALLBACK_MATERIAL, standard);
    const out = getWgpuPbrMaterialScratch();
    writeWgpuPbrStandardBlock(out, standard, subsurface !== null ? subsurface.alphaCutoff : 0.5);
    out.fill(0, 16);
    // subsurface group (floats 36..39): strength, subsurfaceColor.rgb (linear); extra (float 40): thickness.
    if (subsurface !== null) {
      unpackColorToLinear(_colorScratch, subsurface.subsurfaceColor);
      out[36] = subsurface.subsurface;
      out[37] = _colorScratch[0];
      out[38] = _colorScratch[1];
      out[39] = _colorScratch[2];
      out[40] = subsurface.thickness;
    } else {
      out[36] = 0;
      out[37] = 1;
      out[38] = 1;
      out[39] = 1;
      out[40] = 0;
    }
    writeWgpuPbrMaterialUniform(state, binding);

    beginWgpuMeshDraw(state, pipeline);
    pass.setBindGroup(2, binding.bindGroup);
  },

  draw(state: WgpuRenderState, proxy: Readonly<SceneRenderProxy>, geometry: Readonly<MeshGeometry>): void {
    drawWgpuMeshSubset(state, proxy, geometry);
  },
};

// Installs the built-in Subsurface renderer for SubsurfacePbrMaterialKind on this state. Opt-in (no
// top-level side effect): drawScene only draws Subsurface subsets once this is called.
export function registerSubsurfacePbrWgpuMaterial(state: WgpuRenderState): void {
  registerWgpuMeshMaterialRenderer(state, SubsurfacePbrMaterialKind, subsurfacePbrWgpuMeshMaterialRenderer);
}

const FALLBACK_MATERIAL = {} as Readonly<SubsurfacePbrMaterial>;
const _colorScratch: LinearColor = [0, 0, 0, 0];
