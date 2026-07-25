import { createPointLight } from '@flighthq/lighting';
import { addLogSink, createMemoryLogSink, getMemoryLogSinkEntries, removeLogSink } from '@flighthq/log';

import {
  areWgpuSceneForwardLightSelectionGuardsEnabled,
  enableWgpuSceneForwardLightSelectionGuards,
} from './enableWgpuSceneForwardLightSelectionGuards';
import { getWgpuSceneRuntime } from './wgpuSceneRuntime';
import { makeWgpuSceneState } from './wgpuSceneTestHelper';

describe('areWgpuSceneForwardLightSelectionGuardsEnabled', () => {
  it('reports false before installation and true afterward', () => {
    const { state } = makeWgpuSceneState();
    expect(areWgpuSceneForwardLightSelectionGuardsEnabled(state)).toBe(false);
    enableWgpuSceneForwardLightSelectionGuards(state);
    expect(areWgpuSceneForwardLightSelectionGuardsEnabled(state)).toBe(true);
  });
});

describe('enableWgpuSceneForwardLightSelectionGuards', () => {
  it('installs the opt-in warning with actionable selection guidance', () => {
    const { state } = makeWgpuSceneState();
    enableWgpuSceneForwardLightSelectionGuards(state);
    const sink = createMemoryLogSink(4);
    addLogSink(sink.sink);
    try {
      getWgpuSceneRuntime(state).forwardLightSelectionGuard!({
        ambient: null,
        directional: null,
        point: Array.from({ length: 5 }, () => createPointLight()),
      });
      const entries = getMemoryLogSinkEntries(sink);
      expect(entries).toHaveLength(1);
      expect(String((entries[0].data as Record<string, unknown>).message)).toContain('prepareWgpuSceneForwardLights');
    } finally {
      removeLogSink(sink.sink);
    }
  });
});
