import type { WgpuScene3DRuntime, WgpuRenderState, WgpuRenderStateRuntime } from '@flighthq/types';
import { EntityRuntimeKey } from '@flighthq/types';
import type { WgpuSkinningAdapter } from '@flighthq/types';

// Resolves scene-wgpu's private runtime for a WgpuRenderState, allocating it (and wiring the header
// runtime slots to its registry and upload cache) on first use. Mutable by design: the draw path
// writes the caches and shared bindings every frame.
export function getWgpuScene3DRuntime(state: WgpuRenderState): WgpuScene3DRuntime {
  const stateRuntime = state[EntityRuntimeKey] as WgpuRenderStateRuntime;
  let scene = sceneRuntimes.get(state);
  if (scene === undefined) {
    scene = {
      activeBlendedRun: false,
      activeColorAdjustmentRun: false,
      activeSkinnedRun: false,
      activeMeshPipeline: null,
      blendedDrawList: [],
      blendedPool: [],
      drawBindGroup: null,
      drawBindGroupLayout: null,
      customShaderGuard: null,
      frameBindGroup: null,
      frameBindGroupLayout: null,
      frameBuffer: null,
      frameBindings: new WeakMap(),
      forwardLightSelectionGuard: null,
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
      modifierSnippetRegistry: null,
      modifierSnippetRevision: 0,
      opaqueDrawList: [],
      opaquePool: [],
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
      shadedMaterialBindingCache: new WeakMap(),
      shadedMaterialPlanCache: new WeakMap(),
      skinDrawBindGroup: null,
      skinDrawBindGroupLayout: null,
      skinPaletteCapacity: 0,
      skinPaletteTexture: null,
      skinPaletteView: null,
      skinningAdapter: null,
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

export function getWgpuSkinningAdapter(state: WgpuRenderState): WgpuSkinningAdapter | null {
  return getWgpuScene3DRuntime(state).skinningAdapter as WgpuSkinningAdapter | null;
}

const sceneRuntimes = new WeakMap<WgpuRenderState, WgpuScene3DRuntime>();
