import { unpackColorToLinear } from '@flighthq/color/contract';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu/contract';
import type {
  LinearColor,
  Camera3D,
  Material,
  MeshGeometry,
  Scene3DLightBlock,
  Scene3DRenderProxy,
  WgpuMeshMaterialRenderer,
  WgpuRenderState,
  WgpuSkinningAdapter,
  WireframeMaterial,
} from '@flighthq/types/contract';
import { WireframeMaterialKind } from '@flighthq/types/contract';

import { registerWgpuMeshMaterialRenderer } from './wgpuMeshMaterialRegistry.ts';
import {
  beginWgpuMeshDraw,
  ensureWgpuInstanceBuffer,
  writeWgpuDrawUniform,
  writeWgpuFrameUniform,
} from './wgpuMeshPipeline.ts';
import { getWgpuScene3DRuntime } from './wgpuScene3DRuntime.ts';
import { bindWgpuWireframeColor, ensureWgpuWireframePipeline } from './wgpuWireframePrelude.ts';
import { ensureWgpuWireframeUpload } from './wgpuWireframeUpload.ts';

// The built-in Wireframe forward renderer (WgpuMeshMaterialRenderer for WireframeMaterialKind) — the
// WGSL mirror of glWireframeMeshMaterialRenderer. Draws the mesh's triangle edges as line-list
// primitives in a single flat linear color. Unlike the triangle families it does not use
// drawWgpuMeshSubset: draw binds the derived line-index buffer (see wgpuWireframeUpload) and issues a
// line-list indexed draw over the subset's line range. `thickness` > 1 is not honored (WebGPU has no
// line-width control); the field is documented as best-effort and ignored. Lights are ignored. See
// registerWgpuWireframeMaterial to install it.
export const wgpuWireframeMeshMaterialRenderer: WgpuMeshMaterialRenderer = {
  bind(
    state: WgpuRenderState,
    material: Readonly<Material> | null,
    _lights: Readonly<Scene3DLightBlock>,
    camera: Readonly<Camera3D>,
  ): void {
    const stateRuntime = getWgpuRenderStateRuntime(state);
    const pass = stateRuntime.renderPass;
    if (pass === null) return;

    const wireframe = material as Readonly<WireframeMaterial> | null;
    const format = stateRuntime.currentColorFormat ?? state.format;
    const pipeline = ensureWgpuWireframePipeline(state, format, wireframe?.alphaMode === 'mask');
    writeWgpuFrameUniform(state, camera, _lights);

    let group: GPUBindGroup;
    if (wireframe === null) {
      group = bindWgpuWireframeColor(state, pipeline, FALLBACK_MATERIAL, WHITE);
    } else {
      unpackColorToLinear(_scratch, wireframe.color);
      group = bindWgpuWireframeColor(state, pipeline, wireframe, _scratch, wireframe.alphaCutoff);
    }

    beginWgpuMeshDraw(state, pipeline);
    pass.setBindGroup(2, group);
  },

  draw(state: WgpuRenderState, proxy: Readonly<Scene3DRenderProxy>, geometry: Readonly<MeshGeometry>): void {
    const stateRuntime = getWgpuRenderStateRuntime(state);
    const pass = stateRuntime.renderPass;
    const scene = getWgpuScene3DRuntime(state);
    if (pass === null || scene.activeMeshPipeline === null) return;

    const subset = proxy.subset;
    if (subset.indexCount === 0) return;

    const activePipeline = scene.activeMeshPipeline;
    const upload = ensureWgpuWireframeUpload(state, geometry, activePipeline.skinned);
    if (upload === null) return;

    const jointMatrices = proxy.jointMatrices ?? null;
    const normalMatrices = proxy.normalMatrices ?? null;
    const skinning = scene.skinningAdapter as WgpuSkinningAdapter | null;
    // The skinned wireframe pipeline declares the pose + normal palettes beside Draw at group(1), just
    // like the triangle families. Bind that matching group before writing Draw so the palette bases the
    // upload claims are published in the same dynamic uniform record.
    const skinDrawBindGroup =
      activePipeline.skinned && jointMatrices !== null && normalMatrices !== null && skinning !== null
        ? skinning.getMeshDrawBindGroup(state, jointMatrices, normalMatrices)
        : null;
    const drawBindGroup = writeWgpuDrawUniform(state, proxy);
    _dynamicOffsets[0] = scene.pendingDrawOffset;

    pass.setBindGroup(1, skinDrawBindGroup ?? drawBindGroup, _dynamicOffsets);
    pass.setVertexBuffer(0, upload.vertexBuffer);
    pass.setVertexBuffer(1, ensureWgpuInstanceBuffer(state, null, 1));
    pass.setIndexBuffer(upload.lineIndexBuffer, upload.indexFormat);
    // Each triangle index contributes two line indices, so the subset's line range is its triangle
    // range scaled by 2.
    pass.drawIndexed(subset.indexCount * 2, 1, subset.indexOffset * 2, 0, 0);
  },
};

// Registers the built-in Wireframe renderer for WireframeMaterialKind on this state. Opt-in (no top-
// level side effect); call once per WgpuRenderState before renderWgpuScene3D so meshes with
// WireframeMaterials draw.
export function registerWgpuWireframeMaterial(state: WgpuRenderState): void {
  registerWgpuMeshMaterialRenderer(state, WireframeMaterialKind, wgpuWireframeMeshMaterialRenderer);
}

const _scratch: LinearColor = [0, 0, 0, 0];
const _dynamicOffsets = new Uint32Array(1);
const WHITE: LinearColor = [1, 1, 1, 1];
const FALLBACK_MATERIAL = {} as Readonly<WireframeMaterial>;
