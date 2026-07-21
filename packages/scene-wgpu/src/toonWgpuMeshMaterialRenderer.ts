import type { LinearColor } from '@flighthq/color';
import { unpackColorToLinear } from '@flighthq/color';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu';
import type {
  Camera3D,
  Material,
  MeshGeometry,
  SceneLightBlock,
  SceneRenderProxy,
  ToonMaterial,
  WgpuMeshMaterialRenderer,
  WgpuRenderState,
} from '@flighthq/types';
import { ToonMaterialKind } from '@flighthq/types';

import { registerWgpuMeshMaterialRenderer } from './wgpuMeshMaterialRegistry';
import { beginWgpuMeshDraw, drawWgpuMeshSubset, writeWgpuFrameUniform } from './wgpuMeshPipeline';
import type { WgpuToonDefineKey } from './wgpuToonPrelude';
import { bindWgpuToonSurface, ensureWgpuToonPipeline } from './wgpuToonPrelude';

// The built-in Toon (cel-shading) forward-lit mesh-material renderer (WgpuMeshMaterialRenderer for
// ToonMaterialKind) — the WGSL mirror of toonGlMeshMaterialRenderer. bind selects the pipeline variant
// for the material's alpha mode + double-sidedness + the current color-attachment format, writes the
// shared Frame uniform (camera view-projection + position, the packed light block), binds the pipeline
// + Frame bind group (beginWgpuMeshDraw), then writes + binds the material's uniform/texture bind group
// (linear base color, step count, alpha cutoff) at group(2). The diffuse N·L is quantized into stepped
// cel bands in the fragment stage (a stepped floor over `steps`); output is LINEAR color for the
// rgba16float scene target. draw uploads the geometry's GPU buffers lazily (cached by geometry.version),
// writes the per-draw model + normal matrices into the render-state's uniform ring buffer (group(1),
// dynamic offset), and issues the indexed draw over the proxy's subset. Depth-test LESS + depth-write
// on and back-face culling (unless double-sided) are baked on the pipeline. See registerToonWgpuMaterial
// to install it.
//
// MAPS NOT SAMPLED YET: baseColorMap and ramp are not uploaded on wgpu, so the define key keeps
// hasBaseColorMap / hasRamp false (placeholder textures bound, scalar `steps` quantizer used). This
// mirrors the documented gap on the Unlit/StandardPbr wgpu paths — the GL Toon renderer samples both;
// wgpu lights up the same shader branches once texture upload arrives. See wgpuToonPrelude.
//
// Cannot be visually captured in JSDOM (no GPU adapter); the unit test asserts the pipeline/bind/draw
// call shape against the mock device, mirrored against the verified GL result.
export const toonWgpuMeshMaterialRenderer: WgpuMeshMaterialRenderer = {
  bind(
    state: WgpuRenderState,
    material: Readonly<Material> | null,
    lights: Readonly<SceneLightBlock>,
    camera: Readonly<Camera3D>,
  ): void {
    const stateRuntime = getWgpuRenderStateRuntime(state);
    const pass = stateRuntime.renderPass;
    if (pass === null) return;

    const toon = material as Readonly<ToonMaterial> | null;
    const format = stateRuntime.currentColorFormat ?? state.format;
    const pipeline = ensureWgpuToonPipeline(state, defineKeyForMaterial(toon), format);
    writeWgpuFrameUniform(state, camera, lights);

    let group: GPUBindGroup;
    if (toon === null) {
      group = bindWgpuToonSurface(state, pipeline, FALLBACK_MATERIAL, WHITE, 3, 0.5);
    } else {
      unpackColorToLinear(_scratch, toon.baseColor);
      group = bindWgpuToonSurface(state, pipeline, toon, _scratch, toon.steps, toon.alphaCutoff);
    }

    beginWgpuMeshDraw(state, pipeline);
    pass.setBindGroup(2, group);
  },

  draw(state: WgpuRenderState, proxy: Readonly<SceneRenderProxy>, geometry: Readonly<MeshGeometry>): void {
    drawWgpuMeshSubset(state, proxy, geometry);
  },
};

// Registers the built-in Toon renderer for ToonMaterialKind on this state. Opt-in (no top-level side
// effect); call once per WgpuRenderState before drawWgpuScene so meshes with ToonMaterials draw.
export function registerToonWgpuMaterial(state: WgpuRenderState): void {
  registerWgpuMeshMaterialRenderer(state, ToonMaterialKind, toonWgpuMeshMaterialRenderer);
}

// The feature define key for a Toon material: the alpha-mask cutoff and double-sidedness. The map flags
// stay false on wgpu (texture upload not yet wired — see the renderer's maps note), so the quantizer is
// always the scalar `steps` stepped floor and placeholder textures are bound.
function defineKeyForMaterial(material: Readonly<ToonMaterial> | null): WgpuToonDefineKey {
  return {
    alphaMaskEnabled: material !== null && material.alphaMode === 'mask',
    doubleSided: material !== null && material.doubleSided,
    hasBaseColorMap: false,
    hasRamp: false,
  };
}

const _scratch: LinearColor = [0, 0, 0, 0];
const WHITE: LinearColor = [1, 1, 1, 1];
const FALLBACK_MATERIAL = {} as Readonly<ToonMaterial>;
