import type { LinearColor } from '@flighthq/color';
import { unpackColorToLinear } from '@flighthq/color';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu';
import type {
  Camera,
  Material,
  MeshGeometry,
  SceneLightBlock,
  SceneRenderProxy,
  WgpuMeshMaterialRenderer,
  WgpuRenderState,
  WireframeMaterial,
} from '@flighthq/types';
import { WireframeMaterialKind } from '@flighthq/types';

import { registerWgpuMeshMaterialRenderer } from './wgpuMeshMaterialRegistry';
import { beginWgpuMeshDraw, writeWgpuDrawUniform, writeWgpuFrameUniform } from './wgpuMeshPipeline';
import { getWgpuSceneRuntime } from './wgpuSceneRuntime';
import { bindWgpuWireframeColor, ensureWgpuWireframePipeline } from './wgpuWireframePrelude';
import { ensureWgpuWireframeUpload } from './wgpuWireframeUpload';

// The built-in Wireframe forward renderer (WgpuMeshMaterialRenderer for WireframeMaterialKind) — the
// WGSL mirror of wireframeGlMeshMaterialRenderer. Draws the mesh's triangle edges as line-list
// primitives in a single flat linear color. Unlike the triangle families it does not use
// drawWgpuMeshSubset: draw binds the derived line-index buffer (see wgpuWireframeUpload) and issues a
// line-list indexed draw over the subset's line range. `thickness` > 1 is not honored (WebGPU has no
// line-width control); the field is documented as best-effort and ignored. Lights are ignored. See
// registerWireframeWgpuMaterial to install it.
export const wireframeWgpuMeshMaterialRenderer: WgpuMeshMaterialRenderer = {
  bind(
    state: WgpuRenderState,
    material: Readonly<Material> | null,
    _lights: Readonly<SceneLightBlock>,
    camera: Readonly<Camera>,
  ): void {
    const stateRuntime = getWgpuRenderStateRuntime(state);
    const pass = stateRuntime.renderPass;
    if (pass === null) return;

    const wireframe = material as Readonly<WireframeMaterial> | null;
    const format = stateRuntime.currentColorFormat ?? state.format;
    const pipeline = ensureWgpuWireframePipeline(state, format);
    writeWgpuFrameUniform(state, camera, _lights);

    let group: GPUBindGroup;
    if (wireframe === null) {
      group = bindWgpuWireframeColor(state, pipeline, FALLBACK_MATERIAL, WHITE);
    } else {
      unpackColorToLinear(_scratch, wireframe.color);
      group = bindWgpuWireframeColor(state, pipeline, wireframe, _scratch);
    }

    beginWgpuMeshDraw(state, pipeline);
    pass.setBindGroup(2, group);
  },

  draw(state: WgpuRenderState, proxy: Readonly<SceneRenderProxy>, geometry: Readonly<MeshGeometry>): void {
    const stateRuntime = getWgpuRenderStateRuntime(state);
    const pass = stateRuntime.renderPass;
    const scene = getWgpuSceneRuntime(state);
    if (pass === null || scene.activeMeshPipeline === null) return;

    const subset = proxy.subset;
    if (subset.indexCount === 0) return;

    const upload = ensureWgpuWireframeUpload(state, geometry);
    if (upload === null) return;

    const drawBindGroup = writeWgpuDrawUniform(state, proxy);
    _dynamicOffsets[0] = scene.pendingDrawOffset;

    pass.setBindGroup(1, drawBindGroup, _dynamicOffsets);
    pass.setVertexBuffer(0, upload.vertexBuffer);
    pass.setIndexBuffer(upload.lineIndexBuffer, upload.indexFormat);
    // Each triangle index contributes two line indices, so the subset's line range is its triangle
    // range scaled by 2.
    pass.drawIndexed(subset.indexCount * 2, 1, subset.indexOffset * 2, 0, 0);
  },
};

// Registers the built-in Wireframe renderer for WireframeMaterialKind on this state. Opt-in (no top-
// level side effect); call once per WgpuRenderState before drawWgpuScene so meshes with
// WireframeMaterials draw.
export function registerWireframeWgpuMaterial(state: WgpuRenderState): void {
  registerWgpuMeshMaterialRenderer(state, WireframeMaterialKind, wireframeWgpuMeshMaterialRenderer);
}

const _scratch: LinearColor = [0, 0, 0, 0];
const _dynamicOffsets = new Uint32Array(1);
const WHITE: LinearColor = [1, 1, 1, 1];
const FALLBACK_MATERIAL = {} as Readonly<WireframeMaterial>;
