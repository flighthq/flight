import { createPointLight } from '@flighthq/lighting';
import { addLogSink, createMemoryLogSink, getMemoryLogSinkEntries, removeLogSink } from '@flighthq/log';

import {
  areWgpuScene3DForwardLightSelectionGuardsEnabled,
  enableWgpuScene3DForwardLightSelectionGuards,
} from './enableWgpuScene3DForwardLightSelectionGuards';
import { getWgpuScene3DRuntime } from './wgpuScene3DRuntime';
import { makeWgpuScene3DState } from './wgpuScene3DTestHelper';

describe('areWgpuScene3DForwardLightSelectionGuardsEnabled', () => {
  it('reports false before installation and true afterward', () => {
    const { state } = makeWgpuScene3DState();
    expect(areWgpuScene3DForwardLightSelectionGuardsEnabled(state)).toBe(false);
    enableWgpuScene3DForwardLightSelectionGuards(state);
    expect(areWgpuScene3DForwardLightSelectionGuardsEnabled(state)).toBe(true);
  });
});

describe('enableWgpuScene3DForwardLightSelectionGuards', () => {
  it('installs the opt-in warning with actionable selection guidance', () => {
    const { state } = makeWgpuScene3DState();
    enableWgpuScene3DForwardLightSelectionGuards(state);
    const sink = createMemoryLogSink(4);
    addLogSink(sink.sink);
    try {
      getWgpuScene3DRuntime(state).forwardLightSelectionGuard!({
        ambient: null,
        directional: null,
        point: Array.from({ length: 5 }, () => createPointLight()),
      });
      const entries = getMemoryLogSinkEntries(sink);
      expect(entries).toHaveLength(1);
      expect(String((entries[0].data as Record<string, unknown>).message)).toContain('prepareWgpuScene3DForwardLights');
    } finally {
      removeLogSink(sink.sink);
    }
  });
});
