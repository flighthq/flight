import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu';
import type {
  Camera,
  DepthMaterial,
  Material,
  MeshGeometry,
  SceneLightBlock,
  SceneRenderProxy,
  WgpuMeshMaterialRenderer,
  WgpuRenderState,
} from '@flighthq/types';
import { DepthMaterialKind } from '@flighthq/types';

import { bindWgpuDebugSurface, ensureWgpuDebugPipeline } from './wgpuDebugPrelude';
import { registerWgpuMeshMaterialRenderer } from './wgpuMeshMaterialRegistry';
import { beginWgpuMeshDraw, drawWgpuMeshSubset, writeWgpuFrameUniform } from './wgpuMeshPipeline';

// The built-in Depth forward renderer (WgpuMeshMaterialRenderer for DepthMaterialKind) — the WGSL mirror
// of depthGlMeshMaterialRenderer. A lighting-independent debug/utility pass material: bind selects the
// debug pipeline in depth mode for the color format, writes the shared Frame uniform (lights ignored),
// and binds the material's [near, far] linearization range; draw issues the indexed draw. The fragment
// stage linearizes window-space depth into eye space and writes it as grayscale LINEAR color. See
// registerDepthWgpuMaterial to install it.
export const depthWgpuMeshMaterialRenderer: WgpuMeshMaterialRenderer = {
  bind(
    state: WgpuRenderState,
    material: Readonly<Material> | null,
    _lights: Readonly<SceneLightBlock>,
    camera: Readonly<Camera>,
  ): void {
    const stateRuntime = getWgpuRenderStateRuntime(state);
    const pass = stateRuntime.renderPass;
    if (pass === null) return;

    const depth = material as Readonly<DepthMaterial> | null;
    const format = stateRuntime.currentColorFormat ?? state.format;
    const pipeline = ensureWgpuDebugPipeline(state, { hasNormalMap: false, mode: 'depth' }, format);
    writeWgpuFrameUniform(state, camera, _lights);

    let group: GPUBindGroup;
    if (depth === null) {
      group = bindWgpuDebugSurface(state, pipeline, FALLBACK_MATERIAL, 0, 1, 1);
    } else {
      group = bindWgpuDebugSurface(state, pipeline, depth, depth.near, depth.far, 1);
    }

    beginWgpuMeshDraw(state, pipeline);
    pass.setBindGroup(2, group);
  },

  draw(state: WgpuRenderState, proxy: Readonly<SceneRenderProxy>, geometry: Readonly<MeshGeometry>): void {
    drawWgpuMeshSubset(state, proxy, geometry);
  },
};

// Registers the built-in Depth renderer for DepthMaterialKind on this state. Opt-in (no top-level side
// effect); call once per WgpuRenderState before drawWgpuScene so meshes with DepthMaterials draw.
export function registerDepthWgpuMaterial(state: WgpuRenderState): void {
  registerWgpuMeshMaterialRenderer(state, DepthMaterialKind, depthWgpuMeshMaterialRenderer);
}

const FALLBACK_MATERIAL = {} as Readonly<DepthMaterial>;
