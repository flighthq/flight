import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu';
import type {
  AnisotropyPbrMaterial,
  Camera3D,
  Material,
  MeshGeometry,
  SceneLightBlock,
  SceneRenderProxy,
  WgpuMeshMaterialRenderer,
  WgpuRenderState,
} from '@flighthq/types';
import { AnisotropyPbrMaterialKind } from '@flighthq/types';

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

// The built-in Anisotropy (KHR_materials_anisotropy) forward-lit mesh-material renderer — the WGSL
// mirror of anisotropyPbrGlMeshMaterialRenderer. Anisotropy stretches the specular highlight along the
// mesh tangent direction — brushed metal, hair, vinyl — by splitting roughness into along-tangent and
// across-tangent axes and evaluating an anisotropic GGX distribution (Burley) in the shader's rotated
// tangent frame. It REQUIRES mesh tangents, which the canonical PBR vertex record already carries
// (location 2). bind builds the standard define key from `material.standard` + the surface trailer, sets
// the ANISOTROPY flag, selects/compiles that pipeline variant for the current color format, writes the
// shared Frame uniform, then writes the base block + the anisotropy strength/rotation into the one
// MaterialBlock uniform and binds it at group(2). The lobe lives behind `const ANISOTROPY` in the PBR
// uber-shader. The anisotropy direction map is reserved by the descriptor but NOT sampled on wgpu yet
// (maps deferred). See registerAnisotropyPbrWgpuMaterial.
export const anisotropyPbrWgpuMeshMaterialRenderer: WgpuMeshMaterialRenderer = {
  bind(
    state: WgpuRenderState,
    material: Readonly<Material> | null,
    lights: Readonly<SceneLightBlock>,
    camera: Readonly<Camera3D>,
  ): void {
    const stateRuntime = getWgpuRenderStateRuntime(state);
    const pass = stateRuntime.renderPass;
    if (pass === null) return;

    const anisotropy = material as Readonly<AnisotropyPbrMaterial> | null;
    const standard = anisotropy !== null ? anisotropy.standard : null;
    const key = buildWgpuPbrStandardDefineKey(standard, anisotropy);
    key.anisotropyEnabled = true;
    const format = stateRuntime.currentColorFormat ?? state.format;
    const pipeline = ensureWgpuPbrPipeline(state, key, format);

    writeWgpuFrameUniform(state, camera, lights);
    const binding = ensureWgpuPbrMaterialBindGroup(state, pipeline, anisotropy ?? FALLBACK_MATERIAL, standard);
    const out = getWgpuPbrMaterialScratch();
    writeWgpuPbrStandardBlock(out, standard, anisotropy !== null ? anisotropy.alphaCutoff : 0.5);
    out.fill(0, 16);
    // anisotropy group (floats 24..25): strength, rotation (radians).
    out[24] = anisotropy !== null ? anisotropy.anisotropyStrength : 0;
    out[25] = anisotropy !== null ? anisotropy.anisotropyRotation : 0;
    writeWgpuPbrMaterialUniform(state, binding);

    beginWgpuMeshDraw(state, pipeline);
    pass.setBindGroup(2, binding.bindGroup);
  },

  draw(state: WgpuRenderState, proxy: Readonly<SceneRenderProxy>, geometry: Readonly<MeshGeometry>): void {
    drawWgpuMeshSubset(state, proxy, geometry);
  },
};

// Installs the built-in Anisotropy renderer for AnisotropyPbrMaterialKind on this state. Opt-in (no
// top-level side effect): drawScene only draws Anisotropy subsets once this is called.
export function registerAnisotropyPbrWgpuMaterial(state: WgpuRenderState): void {
  registerWgpuMeshMaterialRenderer(state, AnisotropyPbrMaterialKind, anisotropyPbrWgpuMeshMaterialRenderer);
}

const FALLBACK_MATERIAL = {} as Readonly<AnisotropyPbrMaterial>;
