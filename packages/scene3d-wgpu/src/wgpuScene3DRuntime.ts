import type {
  WgpuMeshUpload,
  WgpuScene3DRuntime,
  WgpuRenderState,
  WgpuRenderStateRuntime,
} from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import type { WgpuSkinningAdapter } from '@flighthq/types/contract';

// Resolves scene-wgpu's private runtime for a WgpuRenderState, allocating it and wiring its device-tier
// upload cache on first use. Mutable by design: the draw path writes the caches and shared bindings every
// frame. Material dispatch policy lives on the render state's persistent registry aggregate.
export function getWgpuScene3DRuntime(state: WgpuRenderState): WgpuScene3DRuntime {
  const stateRuntime = state[EntityRuntimeKey] as WgpuRenderStateRuntime;
  let scene = sceneRuntimes.get(state);
  if (scene === undefined) {
    // The runtime accessor routes this slot to the device tier. A derived state must retain the map
    // already installed by its primary instead of replacing it with a state-local upload identity.
    let uploadCache = stateRuntime.sceneMeshUploadCache as WeakMap<object, WgpuMeshUpload> | null | undefined;
    if (uploadCache == null) {
      uploadCache = new WeakMap();
      stateRuntime.sceneMeshUploadCache = uploadCache as unknown as WeakMap<object, object>;
    }
    scene = {
      activeBlendMode: null,
      activeBlendedRun: false,
      activeColorAdjustmentRun: false,
      activeColorMatrixRun: false,
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
      opaqueDrawList: [],
      opaquePool: [],
      pendingDrawOffset: 0,
      pendingSkinNormalPaletteBase: 0,
      pendingSkinPaletteBase: 0,
      // Column-major identity mat3 (the untiled default until a family stashes a real transform).
      pendingUvTransform: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]),
      pipelineCache: new Map(),
      placeholderView: null,
      shadow: null,
      shadowComparisonSampler: null,
      shadowDepthPipeline: null,
      shadowDepthSkinnedPipeline: null,
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
      skinMeshDrawBindGroup: null,
      skinMeshDrawBindGroupLayout: null,
      skinNormalPaletteTexture: null,
      skinNormalPaletteView: null,
      skinArenaFrame: null,
      skinNormalPaletteArenaBases: null,
      skinNormalPaletteArenaCursor: 0,
      skinNormalPaletteArenaRows: 0,
      skinPaletteArenaBases: null,
      skinPaletteArenaCursor: 0,
      skinPaletteArenaRows: 0,
      skinPaletteTexture: null,
      skinPaletteView: null,
      skinningAdapter: null,
      uploadCache,
    };
    sceneRuntimes.set(state, scene);
  }
  return scene;
}

export function getWgpuSkinningAdapter(state: WgpuRenderState): WgpuSkinningAdapter | null {
  return getWgpuScene3DRuntime(state).skinningAdapter as WgpuSkinningAdapter | null;
}

const sceneRuntimes = new WeakMap<WgpuRenderState, WgpuScene3DRuntime>();
