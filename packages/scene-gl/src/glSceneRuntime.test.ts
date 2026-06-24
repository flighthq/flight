import type { GlRenderStateRuntime } from '@flighthq/types';
import { EntityRuntimeKey } from '@flighthq/types';

import { getGlSceneRuntime } from './glSceneRuntime';
import { makeGlSceneState } from './glSceneTestHelper';

describe('getGlSceneRuntime', () => {
  it('lazily allocates one runtime per state and returns the same instance', () => {
    const { state } = makeGlSceneState();
    const first = getGlSceneRuntime(state);
    expect(first.activeMeshProgram).toBeNull();
    expect(first.blendedDrawList).toBeInstanceOf(Array);
    expect(first.blendedPool).toBeInstanceOf(Array);
    expect(first.materialRegistry).toBeInstanceOf(Map);
    expect(first.opaqueDrawList).toBeInstanceOf(Array);
    expect(first.opaquePool).toBeInstanceOf(Array);
    expect(first.programCache).toBeInstanceOf(Map);
    expect(getGlSceneRuntime(state)).toBe(first);
  });

  it('gives each render state its own draw-entry pools, not shared singletons', () => {
    const { state: stateA } = makeGlSceneState();
    const { state: stateB } = makeGlSceneState();
    const rtA = getGlSceneRuntime(stateA);
    const rtB = getGlSceneRuntime(stateB);
    expect(rtA.opaquePool).not.toBe(rtB.opaquePool);
    expect(rtA.blendedPool).not.toBe(rtB.blendedPool);
    expect(rtA.opaqueDrawList).not.toBe(rtB.opaqueDrawList);
    expect(rtA.blendedDrawList).not.toBe(rtB.blendedDrawList);
  });

  it('surfaces its registry and upload cache through the header runtime slots', () => {
    const { state } = makeGlSceneState();
    const scene = getGlSceneRuntime(state);
    const stateRuntime = state[EntityRuntimeKey] as GlRenderStateRuntime;
    expect(stateRuntime.sceneMeshMaterialRegistry).toBe(scene.materialRegistry);
    expect(stateRuntime.sceneMeshUploadCache).toBe(scene.uploadCache);
  });
});
