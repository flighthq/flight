import type { WgpuRenderStateRuntime } from '@flighthq/types';
import { EntityRuntimeKey } from '@flighthq/types';

import { getWgpuSceneRuntime } from './webgpuSceneRuntime';
import { makeWgpuSceneState } from './webgpuSceneTestHelper';

describe('getWgpuSceneRuntime', () => {
  it('lazily creates one runtime per state and returns the same instance', () => {
    const { state } = makeWgpuSceneState();
    const a = getWgpuSceneRuntime(state);
    const b = getWgpuSceneRuntime(state);
    expect(a).toBe(b);
    expect(a.materialRegistry).toBeInstanceOf(Map);
    expect(a.pipelineCache).toBeInstanceOf(Map);
    expect(a.activePipeline).toBeNull();
  });

  it('surfaces the registry and upload cache through the header runtime slots', () => {
    const { state } = makeWgpuSceneState();
    const scene = getWgpuSceneRuntime(state);
    const stateRuntime = state[EntityRuntimeKey] as WgpuRenderStateRuntime;
    expect(stateRuntime.sceneMeshMaterialRegistry).toBe(scene.materialRegistry);
    expect(stateRuntime.sceneMeshUploadCache).toBe(scene.uploadCache);
  });
});
