import type { WgpuRenderStateRuntime } from '@flighthq/types';
import { EntityRuntimeKey } from '@flighthq/types';

import { getWgpuSceneRuntime } from './wgpuSceneRuntime';
import { makeWgpuSceneState } from './wgpuSceneTestHelper';

describe('getWgpuSceneRuntime', () => {
  it('lazily creates one runtime per state and returns the same instance', () => {
    const { state } = makeWgpuSceneState();
    const a = getWgpuSceneRuntime(state);
    const b = getWgpuSceneRuntime(state);
    expect(a).toBe(b);
    expect(a.materialRegistry).toBeInstanceOf(Map);
    expect(a.pipelineCache).toBeInstanceOf(Map);
    expect(a.activeMeshPipeline).toBeNull();
  });

  it('surfaces the registry and upload cache through the header runtime slots', () => {
    const { state } = makeWgpuSceneState();
    const scene = getWgpuSceneRuntime(state);
    const stateRuntime = state[EntityRuntimeKey] as WgpuRenderStateRuntime;
    expect(stateRuntime.sceneMeshMaterialRegistry).toBe(scene.materialRegistry);
    expect(stateRuntime.sceneMeshUploadCache).toBe(scene.uploadCache);
  });
});
