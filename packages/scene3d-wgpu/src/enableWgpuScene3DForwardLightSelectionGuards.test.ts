import { createPointLight } from '@flighthq/lighting/contract';
import {
  addLogSink,
  createLogState,
  createMemoryLogSink,
  getMemoryLogSinkEntries,
  removeLogSink,
} from '@flighthq/log/contract';
import type { LogEntry, MemoryLogSink } from '@flighthq/types/contract';

import {
  areWgpuScene3DForwardLightSelectionGuardsEnabled,
  enableWgpuScene3DForwardLightSelectionGuards,
} from './enableWgpuScene3DForwardLightSelectionGuards.ts';
import { getWgpuScene3DRuntime } from './wgpuScene3DRuntime.ts';
import { makeWgpuScene3DState } from './wgpuScene3DTestHelper.ts';

describe('areWgpuScene3DForwardLightSelectionGuardsEnabled', () => {
  it('reports false before installation and true afterward', () => {
    const { state } = makeWgpuScene3DState();
    expect(areWgpuScene3DForwardLightSelectionGuardsEnabled(state)).toBe(false);
    enableWgpuScene3DForwardLightSelectionGuards(state, createLogState());
    expect(areWgpuScene3DForwardLightSelectionGuardsEnabled(state)).toBe(true);
  });
});

describe('enableWgpuScene3DForwardLightSelectionGuards', () => {
  it('installs the opt-in warning with actionable selection guidance', () => {
    const { state } = makeWgpuScene3DState();
    const logState = createLogState();
    enableWgpuScene3DForwardLightSelectionGuards(state, logState);
    const sink = createMemoryLogSink(4);
    addLogSink(logState, sink.sink);
    try {
      getWgpuScene3DRuntime(state).forwardLightSelectionGuard!({
        ambient: null,
        directional: null,
        point: Array.from({ length: 5 }, () => createPointLight()),
      });
      const entries = readMemoryLogEntries(sink);
      expect(entries).toHaveLength(1);
      expect(String((entries[0].data as Record<string, unknown>).message)).toContain('prepareWgpuScene3DForwardLights');
    } finally {
      removeLogSink(logState, sink.sink);
    }
  });
});

function readMemoryLogEntries(sink: Readonly<MemoryLogSink>): LogEntry[] {
  const entries: LogEntry[] = [];
  getMemoryLogSinkEntries(entries, sink);
  return entries;
}
