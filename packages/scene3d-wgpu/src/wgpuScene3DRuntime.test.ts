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
    expect(a.pipelineCache).toBeInstanceOf(Map);
    expect(a.activeBlendMode).toBeNull();
    expect(a.activeMeshPipeline).toBeNull();
  });

  it('surfaces its upload cache without replacing persistent material dispatch policy', () => {
    const { state } = makeWgpuScene3DState();
    const stateRuntime = state[EntityRuntimeKey] as WgpuRenderStateRuntime;
    const materials = stateRuntime.registries.meshMaterialRenderers;
    const modifierSnippets = stateRuntime.registries.modifierSnippets;
    const modifierSnippetRevision = stateRuntime.registries.modifierSnippetRevision;
    const scene = getWgpuScene3DRuntime(state);
    expect(stateRuntime.registries.meshMaterialRenderers).toBe(materials);
    expect(stateRuntime.registries.modifierSnippets).toBe(modifierSnippets);
    expect(stateRuntime.registries.modifierSnippetRevision).toBe(modifierSnippetRevision);
    expect(stateRuntime.context.sceneMeshUploadCache).toBe(scene.uploadCache);
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
