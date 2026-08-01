import type { WgpuRenderStateRuntime } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { getWgpuScene3DRuntime, getWgpuSkinningAdapter } from './wgpuScene3DRuntime';
import { makeWgpuScene3DState } from './wgpuScene3DTestHelper';
import { registerWgpuGpuSkinning } from './wgpuSkinPalette';

describe('getWgpuScene3DRuntime', () => {
  it('lazily creates one runtime per state and returns the same instance', () => {
    const { state } = makeWgpuScene3DState();
    const a = getWgpuScene3DRuntime(state);
    const b = getWgpuScene3DRuntime(state);
    expect(a).toBe(b);
    expect(a.materialRegistry).toBeInstanceOf(Map);
    expect(a.pipelineCache).toBeInstanceOf(Map);
    expect(a.activeAlphaType).toBeNull();
    expect(a.activeBlendMode).toBeNull();
    expect(a.activeMeshPipeline).toBeNull();
  });

  it('surfaces the registry and upload cache through the header runtime slots', () => {
    const { state } = makeWgpuScene3DState();
    const scene = getWgpuScene3DRuntime(state);
    const stateRuntime = state[EntityRuntimeKey] as WgpuRenderStateRuntime;
    expect(stateRuntime.sceneMeshMaterialRegistry).toBe(scene.materialRegistry);
    expect(stateRuntime.sceneMeshUploadCache).toBe(scene.uploadCache);
  });
});

describe('getWgpuSkinningAdapter', () => {
  it('returns the state-scoped opt-in adapter', () => {
    const { state } = makeWgpuScene3DState();
    expect(getWgpuSkinningAdapter(state)).toBeNull();
    registerWgpuGpuSkinning(state);
    expect(getWgpuSkinningAdapter(state)).not.toBeNull();
  });
});
