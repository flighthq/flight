import type { Kind, Matrix4, WgpuMeshMaterialRenderer, WgpuRenderState, WgpuRenderStateRuntime } from '@flighthq/types';
import { EntityRuntimeKey } from '@flighthq/types';

import type { WgpuMeshPipeline } from './wgpuMeshPipeline';

// The active directional shadow for this state, set by drawWgpuSceneShadowMap and read by the lit bind
// (beginWgpuMeshDraw → ensureWgpuShadowSampleBindGroup) so every lit family samples the same shadow map.
// The WGSL mirror of scene-gl's GlSceneShadow. The depth texture is a sampleable depth32float target the
// depth pass renders into and the lit fs_main PCF-samples; `matrix` is the light view-projection (world →
// shadow clip). Null = no shadow this frame (lit draws bind a 1x1 dummy depth texture, gated off by the
// shadow uniform). The depth texture is a non-GC GPU resource — freed by destroyWgpuSceneShadow.
export interface WgpuSceneShadow {
  depthTexture: GPUTexture;
  depthView: GPUTextureView;
  matrix: Matrix4;
}

// The baked image-based-lighting set for this state, produced by bakeWgpuEnvironmentIbl and read by the
// lit PBR bind (beginWgpuMeshDraw → ensureWgpuIblSampleBindGroup) so every PBR draw samples the same
// environment. The WGSL mirror of scene-gl's GlSceneIbl. Null = no IBL this frame (the PBR ambient falls
// back to the flat ambient term; the lit draws bind 1x1 dummy cube/LUT textures gated off by the IBL
// uniform). The three GPU textures are the split-sum approximation: a diffuse irradiance cubemap, a
// roughness-mipped prefiltered specular cubemap, and the 2D BRDF integration LUT. `intensity` scales the
// environment's contribution (Environment.intensity). The textures are non-GC GPU resources — freed by
// destroyWgpuSceneIbl. Each `*View` is the sampleable cube/2D view the lit bind wires into group(4).
export interface WgpuSceneIbl {
  brdfLut: GPUTexture;
  brdfLutView: GPUTextureView;
  intensity: number;
  irradianceCube: GPUTexture;
  irradianceCubeView: GPUTextureView;
  prefilteredCube: GPUTexture;
  prefilteredCubeView: GPUTextureView;
  prefilteredMipCount: number;
}

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
  // Image-based-lighting state (mirrors GlSceneRuntime.ibl / environmentSourceCube). `environmentSource*`
  // is the uploaded source radiance cube (ensureWgpuEnvironmentSourceCube); `ibl` is the baked split-sum
  // result written by bakeWgpuEnvironmentIbl. The rest are the lazily-created singletons the lit sample
  // side (everything ibl* prefixed) reuses each frame: the IBL uniform buffer (enabled/intensity/maxMip),
  // a filtering sampler, 1x1 dummy cube + 2D LUT for the no-IBL case, and the shared group(4) sample
  // layout + bind group (rebuilt only when the bound irradiance view changes present ↔ absent). All
  // created lazily, so a state that never bakes IBL pays nothing. Freed by destroyWgpuSceneIbl.
  environmentSourceCube: GPUTexture | null;
  environmentSourceCubeView: GPUTextureView | null;
  ibl: WgpuSceneIbl | null;
  iblDummyCubeTexture: GPUTexture | null;
  iblDummyCubeView: GPUTextureView | null;
  iblDummyLutTexture: GPUTexture | null;
  iblDummyLutView: GPUTextureView | null;
  iblSampleBindGroup: GPUBindGroup | null;
  iblSampleCubeView: GPUTextureView | null;
  iblSampleLayout: GPUBindGroupLayout | null;
  iblSampler: GPUSampler | null;
  iblUniformBuffer: GPUBuffer | null;
  materialBindGroups: WeakMap<object, WgpuMaterialBinding>;
  materialRegistry: Map<Kind, WgpuMeshMaterialRenderer>;
  pendingDrawOffset: number;
  pipelineCache: Map<string, WgpuMeshPipeline>;
  placeholderView: GPUTextureView | null;
  // Directional shadow state (mirrors GlSceneRuntime.shadow/shadowTarget). `shadow` is the per-frame
  // result written by drawWgpuSceneShadowMap; the rest are the lazily-created singletons the write side
  // (shadowDepthPipeline) and the sample side (everything shadowSample*/shadowUniform*/shadowDummy*/
  // shadowComparisonSampler) reuse each frame. The shadow-sample bind group is rebuilt only when the
  // bound depth view changes (present ↔ absent); its uniform is rewritten every bind. All created lazily,
  // so a state that never draws a shadow map pays nothing. Freed by destroyWgpuSceneShadow.
  shadow: WgpuSceneShadow | null;
  shadowComparisonSampler: GPUSampler | null;
  shadowDepthPipeline: GPURenderPipeline | null;
  shadowDummyTexture: GPUTexture | null;
  shadowDummyView: GPUTextureView | null;
  shadowSampleBindGroup: GPUBindGroup | null;
  shadowSampleLayout: GPUBindGroupLayout | null;
  shadowSampleView: GPUTextureView | null;
  shadowUniformBuffer: GPUBuffer | null;
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
      environmentSourceCube: null,
      environmentSourceCubeView: null,
      ibl: null,
      iblDummyCubeTexture: null,
      iblDummyCubeView: null,
      iblDummyLutTexture: null,
      iblDummyLutView: null,
      iblSampleBindGroup: null,
      iblSampleCubeView: null,
      iblSampleLayout: null,
      iblSampler: null,
      iblUniformBuffer: null,
      materialBindGroups: new WeakMap(),
      materialRegistry: new Map(),
      pendingDrawOffset: 0,
      pipelineCache: new Map(),
      placeholderView: null,
      shadow: null,
      shadowComparisonSampler: null,
      shadowDepthPipeline: null,
      shadowDummyTexture: null,
      shadowDummyView: null,
      shadowSampleBindGroup: null,
      shadowSampleLayout: null,
      shadowSampleView: null,
      shadowUniformBuffer: null,
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
