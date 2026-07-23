import { unpackColorToLinear } from '@flighthq/color';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu';
import type {
  LinearColor,
  Camera3D,
  Material,
  MeshGeometry,
  SceneLightBlock,
  SceneRenderProxy,
  TransmissionVolumePbrMaterial,
  WgpuMeshMaterialRenderer,
  WgpuRenderState,
} from '@flighthq/types';
import { TransmissionVolumePbrMaterialKind } from '@flighthq/types';

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

// The built-in TransmissionVolume (KHR_materials_transmission + KHR_materials_volume) forward-lit
// mesh-material renderer for refractive, see-through surfaces (glass, liquid) — the WGSL mirror of
// transmissionVolumePbrGlMeshMaterialRenderer.
//
// APPROXIMATION (not physically refractive yet): a true transmission path needs the Phase-5
// opaque-scene-color capture pass to sample what lies behind the surface and refract it through the
// surface IOR, with Beer-Lambert absorption over the volume `thickness`. Until that pass exists, this
// renderer models transmission cheaply behind `const TRANSMISSION`: it attenuates the fragment's
// coverage (alpha) by the `transmission` factor so the surface reads as translucent, and tints the lit
// radiance by `attenuationColor`. The surface is therefore drawn as a tinted, partially transparent lit
// shell rather than a refracting lens. `thickness`, `attenuationDistance`, and `ior` are accepted on the
// material but only `transmission`/`attenuationColor` drive the current shader.
//
// bind builds the standard define key from `material.standard` + the surface trailer, sets the
// TRANSMISSION flag, selects/compiles that pipeline variant for the current color format, writes the
// shared Frame uniform, then writes the base block + the transmission factor / linear-decoded
// attenuationColor into the one MaterialBlock uniform and binds it at group(2). The transmission/
// thickness maps are reserved but NOT sampled on wgpu yet (maps deferred). See
// registerTransmissionVolumePbrWgpuMaterial.
export const transmissionVolumePbrWgpuMeshMaterialRenderer: WgpuMeshMaterialRenderer = {
  bind(
    state: WgpuRenderState,
    material: Readonly<Material> | null,
    lights: Readonly<SceneLightBlock>,
    camera: Readonly<Camera3D>,
  ): void {
    const stateRuntime = getWgpuRenderStateRuntime(state);
    const pass = stateRuntime.renderPass;
    if (pass === null) return;

    const transmission = material as Readonly<TransmissionVolumePbrMaterial> | null;
    const standard = transmission !== null ? transmission.standard : null;
    const key = buildWgpuPbrStandardDefineKey(standard, transmission);
    key.transmissionEnabled = true;
    const format = stateRuntime.currentColorFormat ?? state.format;
    const pipeline = ensureWgpuPbrPipeline(state, key, format);

    writeWgpuFrameUniform(state, camera, lights);
    const binding = ensureWgpuPbrMaterialBindGroup(state, pipeline, transmission ?? FALLBACK_MATERIAL, standard);
    const out = getWgpuPbrMaterialScratch();
    writeWgpuPbrStandardBlock(out, standard, transmission !== null ? transmission.alphaCutoff : 0.5);
    out.fill(0, 16);
    // transmission group (floats 44..47): transmission factor, attenuationColor.rgb (linear).
    if (transmission !== null) {
      unpackColorToLinear(_colorScratch, transmission.attenuationColor);
      out[44] = transmission.transmission;
      out[45] = _colorScratch[0];
      out[46] = _colorScratch[1];
      out[47] = _colorScratch[2];
    } else {
      out[44] = 0;
      out[45] = 1;
      out[46] = 1;
      out[47] = 1;
    }
    writeWgpuPbrMaterialUniform(state, binding);

    beginWgpuMeshDraw(state, pipeline);
    pass.setBindGroup(2, binding.bindGroup);
  },

  draw(state: WgpuRenderState, proxy: Readonly<SceneRenderProxy>, geometry: Readonly<MeshGeometry>): void {
    drawWgpuMeshSubset(state, proxy, geometry);
  },
};

// Installs the built-in TransmissionVolume renderer for TransmissionVolumePbrMaterialKind on this
// state. Opt-in (no top-level side effect): drawScene only draws TransmissionVolume subsets once this
// is called.
export function registerTransmissionVolumePbrWgpuMaterial(state: WgpuRenderState): void {
  registerWgpuMeshMaterialRenderer(
    state,
    TransmissionVolumePbrMaterialKind,
    transmissionVolumePbrWgpuMeshMaterialRenderer,
  );
}

const FALLBACK_MATERIAL = {} as Readonly<TransmissionVolumePbrMaterial>;
const _colorScratch: LinearColor = [0, 0, 0, 0];
