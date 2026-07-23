import type { WgpuSceneRuntime, WgpuRenderState, WgpuRenderStateRuntime } from '@flighthq/types';
import { EntityRuntimeKey } from '@flighthq/types';

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
      pbrSampleBindGroup: null,
      pbrSampleIblCubeView: null,
      pbrSampleLayout: null,
      pbrSampleShadowView: null,
      materialRegistry: new Map(),
      pendingDrawOffset: 0,
      // Column-major identity mat3 (the untiled default until a family stashes a real transform).
      pendingUvTransform: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]),
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
