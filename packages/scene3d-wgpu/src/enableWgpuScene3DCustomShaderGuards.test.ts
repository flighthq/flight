import { addLogSink, createMemoryLogSink, getMemoryLogSinkEntries, removeLogSink } from '@flighthq/log/contract';
import { createCustomShaderMaterial } from '@flighthq/materials/contract';

import {
  areWgpuScene3DCustomShaderGuardsEnabled,
  enableWgpuScene3DCustomShaderGuards,
  runWgpuCustomShaderGuards,
} from './enableWgpuScene3DCustomShaderGuards';
import { makeWgpuScene3DState } from './wgpuScene3DTestHelper';

describe('areWgpuScene3DCustomShaderGuardsEnabled', () => {
  it('reports installation state', () => {
    const { state } = makeWgpuScene3DState();
    expect(areWgpuScene3DCustomShaderGuardsEnabled(state)).toBe(false);
    enableWgpuScene3DCustomShaderGuards(state);
    expect(areWgpuScene3DCustomShaderGuardsEnabled(state)).toBe(true);
  });
});

describe('enableWgpuScene3DCustomShaderGuards', () => {
  it('is idempotent', () => {
    const { state } = makeWgpuScene3DState();
    enableWgpuScene3DCustomShaderGuards(state);
    enableWgpuScene3DCustomShaderGuards(state);
    expect(areWgpuScene3DCustomShaderGuardsEnabled(state)).toBe(true);
  });
});

describe('runWgpuCustomShaderGuards', () => {
  it('warns on bad vector lengths, capacity overflow, and missing reserved bindings', () => {
    const { state } = makeWgpuScene3DState();
    enableWgpuScene3DCustomShaderGuards(state);
    const uniforms: Record<string, number[]> = {};
    for (let i = 0; i < 33; i++) uniforms[`value${i}`] = [i];
    uniforms['invalid'] = [1, 2, 3, 4, 5];
    const material = createCustomShaderMaterial({
      shaderKey: 'guard-contract-test',
      textures: { a: {} as never },
      uniforms,
    });
    const sink = createMemoryLogSink(16);
    addLogSink(sink.sink);
    try {
      runWgpuCustomShaderGuards(
        state,
        material.shaderKey,
        '@group(0) @binding(0) var<uniform> frame: vec4f;',
        material,
      );
      const messages = getMemoryLogSinkEntries(sink).map((entry) =>
        String((entry.data as Record<string, unknown>).message),
      );
      expect(messages.some((message) => message.includes('1–4 components'))).toBe(true);
      expect(messages.some((message) => message.includes('32-vec4'))).toBe(true);
      expect(messages.some((message) => message.includes('@group(1) @binding(0)'))).toBe(true);
      expect(messages.some((message) => message.includes('@group(3) @binding(1)'))).toBe(true);
    } finally {
      removeLogSink(sink.sink);
    }
  });

  it('does nothing until enabled', () => {
    const { state } = makeWgpuScene3DState();
    const sink = createMemoryLogSink(2);
    addLogSink(sink.sink);
    try {
      runWgpuCustomShaderGuards(state, 'disabled-guard-test', '', createCustomShaderMaterial());
      expect(getMemoryLogSinkEntries(sink)).toHaveLength(0);
    } finally {
      removeLogSink(sink.sink);
    }
  });
});
