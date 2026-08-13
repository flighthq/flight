import { addLogSink, createMemoryLogSink, getMemoryLogSinkEntries, removeLogSink } from '@flighthq/log/contract';
import {
  acquireWgpuRenderTexture,
  beginWgpuFrame,
  createWgpuRenderStateForTest,
  createWgpuRenderTexturePool,
  installWgpuMock,
  writeWgpuRenderTextureTarget,
} from '@flighthq/render-wgpu/contract';
import type { LogEntry, RenderEffect, WgpuRenderEffectRunner, WgpuRenderState } from '@flighthq/types/contract';

import {
  areWgpuRenderEffectGuardsEnabled,
  disableWgpuRenderEffectGuards,
  enableWgpuRenderEffectGuards,
} from './enableWgpuRenderEffectGuards';
import {
  beginWgpuRenderEffectPipeline,
  createWgpuRenderEffectPipeline,
  endWgpuRenderEffectPipeline,
} from './wgpuRenderEffectPipeline';
import { registerWgpuRenderEffect } from './wgpuRenderEffectRegistry';
import { applyWgpuRenderEffectsToRenderTexture } from './wgpuRenderTextureEffect';

beforeAll(() => installWgpuMock());

describe('areWgpuRenderEffectGuardsEnabled', () => {
  it('reports whether diagnostics were installed for the state', async () => {
    const state = await createWgpuRenderStateForTest();
    expect(areWgpuRenderEffectGuardsEnabled(state)).toBe(false);

    enableWgpuRenderEffectGuards(state);
    expect(areWgpuRenderEffectGuardsEnabled(state)).toBe(true);

    disableWgpuRenderEffectGuards(state);
    expect(areWgpuRenderEffectGuardsEnabled(state)).toBe(false);
  });
});

describe('disableWgpuRenderEffectGuards', () => {
  it('stops reporting, leaving the silent sentinel silent again', async () => {
    const state = await createWgpuRenderStateForTest();
    enableWgpuRenderEffectGuards(state);
    disableWgpuRenderEffectGuards(state);

    const entries = captureLog(() => {
      expect(applyChain(state, ['test.wgpu-disabled-kind'])).toBe(false);
    });

    expect(entries.length).toBe(0);
  });
});

describe('enableWgpuRenderEffectGuards', () => {
  // logOnce suppresses a key for the whole PROCESS, so a fired key can never fire again in a later test.
  // Both the fire and the silence assertions live in this one test, in order, and every test in this file
  // uses distinct effect kinds so no two share a key.
  it('WARNS that an unregistered chain returned false without writing dest, then stays quiet', async () => {
    const state = await createWgpuRenderStateForTest();
    enableWgpuRenderEffectGuards(state);

    const entries = captureLog(() => {
      expect(applyChain(state, ['test.wgpu-unregistered-a'])).toBe(false);
    });

    expect(entries).toHaveLength(1);
    expect(messageOf(entries[0])).toContain('NEVER WRITTEN');
    expect(messageOf(entries[0])).toContain('registerWgpuRenderEffect');

    const again = captureLog(() => {
      expect(applyChain(state, ['test.wgpu-unregistered-a'])).toBe(false);
    });

    expect(again).toHaveLength(0);
  });

  it('WARNS that a partially registered chain silently DROPPED the effects it could not run', async () => {
    const state = await createWgpuRenderStateForTest();
    enableWgpuRenderEffectGuards(state);
    registerWgpuRenderEffect(state, 'test.wgpu-registered-b', noopRunner);

    const entries = captureLog(() => {
      expect(applyChain(state, ['test.wgpu-registered-b', 'test.wgpu-unregistered-b'])).toBe(true);
    });

    expect(entries).toHaveLength(1);
    expect(messageOf(entries[0])).toContain('SKIPPED');
    expect(messageOf(entries[0])).toContain('test.wgpu-unregistered-b');
  });

  it('WARNS that a pipeline pass DROPPED an effect kind with no runner, once per kind', async () => {
    const state = await createWgpuRenderStateForTest();
    enableWgpuRenderEffectGuards(state);
    const pipeline = createWgpuRenderEffectPipeline(state);
    const chain = [{ kind: 'test.wgpu-pipeline-dropped-kind' }] as unknown as Readonly<RenderEffect>[];

    const entries = captureLog(() => {
      beginWgpuFrame(state);
      beginWgpuRenderEffectPipeline(state, pipeline);
      endWgpuRenderEffectPipeline(state, pipeline, chain);
    });

    expect(entries).toHaveLength(1);
    expect(messageOf(entries[0])).toContain('test.wgpu-pipeline-dropped-kind');
    expect(messageOf(entries[0])).toContain('SKIPPED');

    // Once per KIND, not once per frame: a chain missing the same effect every frame is one observation,
    // and a warning that repeated per frame would be its own defect.
    const again = captureLog(() => {
      beginWgpuFrame(state);
      beginWgpuRenderEffectPipeline(state, pipeline);
      endWgpuRenderEffectPipeline(state, pipeline, chain);
    });

    expect(again).toHaveLength(0);
  });

  it('stays SILENT for an empty chain, which is a no-op the caller asked for rather than a miss', async () => {
    const state = await createWgpuRenderStateForTest();
    enableWgpuRenderEffectGuards(state);

    const entries = captureLog(() => {
      expect(applyChain(state, [])).toBe(false);
    });

    expect(entries).toHaveLength(0);
  });

  it('stays SILENT when every requested effect has a runner', async () => {
    const state = await createWgpuRenderStateForTest();
    enableWgpuRenderEffectGuards(state);
    registerWgpuRenderEffect(state, 'test.wgpu-registered-c', noopRunner);

    const entries = captureLog(() => {
      expect(applyChain(state, ['test.wgpu-registered-c'])).toBe(true);
    });

    expect(entries).toHaveLength(0);
  });
});

function applyChain(state: WgpuRenderState, kinds: readonly string[]): boolean {
  const pool = createWgpuRenderTexturePool();
  const source = acquireWgpuRenderTexture(state, pool, { width: 8, height: 8 });
  const dest = acquireWgpuRenderTexture(state, pool, { width: 8, height: 8 });
  const scratch = acquireWgpuRenderTexture(state, pool, { width: 8, height: 8 });
  // Realize the source so `source-unavailable` is not what is being measured here.
  writeWgpuRenderTextureTarget(state, source, () => {});
  const effects = kinds.map((kind) => ({ kind }) as unknown as Readonly<RenderEffect>);
  return applyWgpuRenderEffectsToRenderTexture(state, pool, source, dest, scratch, effects);
}

function captureLog(run: () => void): readonly LogEntry[] {
  const sink = createMemoryLogSink(8);
  addLogSink(sink.sink);
  try {
    run();
  } finally {
    removeLogSink(sink.sink);
  }
  return getMemoryLogSinkEntries(sink);
}

function messageOf(entry: Readonly<LogEntry>): string {
  const data = entry.data;
  return typeof data === 'string' ? data : String(data.message);
}

const noopRunner: WgpuRenderEffectRunner = () => {};
