import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu';
import type {
  Camera3D,
  Material,
  MeshGeometry,
  NormalMaterial,
  SceneLightBlock,
  SceneRenderProxy,
  WgpuMeshMaterialRenderer,
  WgpuRenderState,
} from '@flighthq/types';
import { NormalMaterialKind } from '@flighthq/types';

import { bindWgpuDebugSurface, ensureWgpuDebugPipeline } from './wgpuDebugPrelude';
import { registerWgpuMeshMaterialRenderer } from './wgpuMeshMaterialRegistry';
import { beginWgpuMeshDraw, drawWgpuMeshSubset, writeWgpuFrameUniform } from './wgpuMeshPipeline';

// The built-in Normal forward renderer (WgpuMeshMaterialRenderer for NormalMaterialKind) — the WGSL
// mirror of normalGlMeshMaterialRenderer. A lighting-independent debug/utility pass material: bind
// selects the debug pipeline in normal mode for the color format, writes the shared Frame uniform
// (lights ignored), and binds the material's normalScale; draw issues the indexed draw. The fragment
// stage transforms the geometric normal by the normal matrix (so the visualized normal is WORLD-space)
// and encodes it as `n * 0.5 + 0.5` LINEAR color. The tangent-space normal map is NOT sampled on wgpu
// yet — hasNormalMap stays false and the shared placeholder texture is bound (mirrors the documented map
// gap on the rest of the wgpu side; see wgpuDebugPrelude). See registerNormalWgpuMaterial to install it.
export const normalWgpuMeshMaterialRenderer: WgpuMeshMaterialRenderer = {
  bind(
    state: WgpuRenderState,
    material: Readonly<Material> | null,
    _lights: Readonly<SceneLightBlock>,
    camera: Readonly<Camera3D>,
  ): void {
    const stateRuntime = getWgpuRenderStateRuntime(state);
    const pass = stateRuntime.renderPass;
    if (pass === null) return;

    const normal = material as Readonly<NormalMaterial> | null;
    const format = stateRuntime.currentColorFormat ?? state.format;
    // normalMap is not yet uploaded on wgpu, so the map variant is never selected — keep hasNormalMap
    // false and bind the shared placeholder. This will flip to follow normal.normalMap when wgpu texture
    // upload lands, matching the GL renderer's behavior.
    const pipeline = ensureWgpuDebugPipeline(state, { hasNormalMap: false, mode: 'normal' }, format);
    writeWgpuFrameUniform(state, camera, _lights);

    let group: GPUBindGroup;
    if (normal === null) {
      group = bindWgpuDebugSurface(state, pipeline, FALLBACK_MATERIAL, 0, 1, 1);
    } else {
      group = bindWgpuDebugSurface(state, pipeline, normal, 0, 1, normal.normalScale);
    }

    beginWgpuMeshDraw(state, pipeline);
    pass.setBindGroup(2, group);
  },

  draw(state: WgpuRenderState, proxy: Readonly<SceneRenderProxy>, geometry: Readonly<MeshGeometry>): void {
    drawWgpuMeshSubset(state, proxy, geometry);
  },
};

// Registers the built-in Normal renderer for NormalMaterialKind on this state. Opt-in (no top-level side
// effect); call once per WgpuRenderState before drawWgpuScene so meshes with NormalMaterials draw.
export function registerNormalWgpuMaterial(state: WgpuRenderState): void {
  registerWgpuMeshMaterialRenderer(state, NormalMaterialKind, normalWgpuMeshMaterialRenderer);
}

const FALLBACK_MATERIAL = {} as Readonly<NormalMaterial>;
