import type { GlRenderStateRuntime } from '@flighthq/types';
import { EntityRuntimeKey } from '@flighthq/types';

import { getGlSceneRuntime } from './glSceneRuntime';
import { makeGlSceneState } from './glSceneTestHelper';

describe('getGlSceneRuntime', () => {
  it('lazily allocates one runtime per state and returns the same instance', () => {
    const { state } = makeGlSceneState();
    const first = getGlSceneRuntime(state);
    expect(first.materialRegistry).toBeInstanceOf(Map);
    expect(first.programCache).toBeInstanceOf(Map);
    expect(first.activeMeshProgram).toBeNull();
    expect(getGlSceneRuntime(state)).toBe(first);
  });

  it('surfaces its registry and upload cache through the header runtime slots', () => {
    const { state } = makeGlSceneState();
    const scene = getGlSceneRuntime(state);
    const stateRuntime = state[EntityRuntimeKey] as GlRenderStateRuntime;
    expect(stateRuntime.sceneMeshMaterialRegistry).toBe(scene.materialRegistry);
    expect(stateRuntime.sceneMeshUploadCache).toBe(scene.uploadCache);
  });
});
