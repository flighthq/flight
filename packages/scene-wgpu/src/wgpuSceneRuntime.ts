import type { Kind, WgpuMeshMaterialRenderer, WgpuRenderState, WgpuRenderStateRuntime } from '@flighthq/types';
import { EntityRuntimeKey } from '@flighthq/types';

import type { WgpuMeshPipeline } from './wgpuMeshPipeline';

// scene-wgpu's per-WgpuRenderState private state — the WGSL mirror of GlSceneRuntime. Holds the 3D
// mesh-material registry, the shared mesh-material pipeline cache (keyed by family + define key +
// color-attachment format), the per-state geometry GPU-upload cache, the shared group(0)/group(1)
// Frame + Draw bind-group layouts (every family pipeline targets these), and the shared GPU resources
// the draw path reuses every frame (the Frame uniform buffer + its bind group, the dynamic-offset Draw
// bind group, the 1x1 placeholder map texture, and a per-material bind-group cache). `activeMeshPipeline`
// is the bind()→draw() handoff. All scene-wgpu-owned and distinct from the 2D renderer's
// materialRendererMap/textureCache — a material kind is either 2D or 3D, never both. The registry and
// upload cache are surfaced through the header's WgpuRenderStateRuntime.sceneMeshMaterialRegistry /
// sceneMeshUploadCache slots (kept opaque there); everything else lives only here. One WgpuSceneRuntime
// is created lazily per state by getWgpuSceneRuntime.
export interface WgpuSceneRuntime {
  activeMeshPipeline: WgpuMeshPipeline | null;
  drawBindGroup: GPUBindGroup | null;
  drawBindGroupLayout: GPUBindGroupLayout | null;
  frameBindGroup: GPUBindGroup | null;
  frameBindGroupLayout: GPUBindGroupLayout | null;
  frameBuffer: GPUBuffer | null;
  materialBindGroups: WeakMap<object, WgpuMaterialBinding>;
  materialRegistry: Map<Kind, WgpuMeshMaterialRenderer>;
  pendingDrawOffset: number;
  pipelineCache: Map<string, WgpuMeshPipeline>;
  placeholderView: GPUTextureView | null;
  uploadCache: WeakMap<object, WgpuMeshUpload>;
}

// The GPU upload of one MeshGeometry for one WgpuRenderState: the interleaved vertex buffer, the index
// buffer + its element format and count, and the geometry `version` the buffers were uploaded at (so a
// bumped version forces a re-upload). Cached in the upload cache keyed by the geometry entity, the
// per-state parallel of MeshGeometryRuntime.webgpuData.
export interface WgpuMeshUpload {
  indexBuffer: GPUBuffer | null;
  indexCount: number;
  indexFormat: GPUIndexFormat;
  version: number;
  vertexBuffer: GPUBuffer;
}

// One material's per-state GPU binding: the Material uniform buffer (re-written each bind with the
// material's factors) and the bind group wiring it + the placeholder maps to the pipeline's
// material bind-group layout.
export interface WgpuMaterialBinding {
  bindGroup: GPUBindGroup;
  buffer: GPUBuffer;
}

// Resolves scene-wgpu's private runtime for a WgpuRenderState, allocating it (and wiring the header
// runtime slots to its registry and upload cache) on first use. Mutable by design: the draw path
// writes the caches and shared bindings every frame.
export function getWgpuSceneRuntime(state: WgpuRenderState): WgpuSceneRuntime {
  const stateRuntime = state[EntityRuntimeKey] as WgpuRenderStateRuntime;
  let scene = sceneRuntimes.get(state);
  if (scene === undefined) {
    scene = {
      activeMeshPipeline: null,
      drawBindGroup: null,
      drawBindGroupLayout: null,
      frameBindGroup: null,
      frameBindGroupLayout: null,
      frameBuffer: null,
      materialBindGroups: new WeakMap(),
      materialRegistry: new Map(),
      pendingDrawOffset: 0,
      pipelineCache: new Map(),
      placeholderView: null,
      uploadCache: new WeakMap(),
    };
    sceneRuntimes.set(state, scene);
    // Surface the registry + upload cache through the header's opaque runtime slots so other code (and
    // a future destroy path) can find them by name without importing scene-wgpu internals.
    stateRuntime.sceneMeshMaterialRegistry = scene.materialRegistry;
    stateRuntime.sceneMeshUploadCache = scene.uploadCache;
  }
  return scene;
}

const sceneRuntimes = new WeakMap<WgpuRenderState, WgpuSceneRuntime>();
