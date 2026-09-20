import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import {
  addLogSink,
  clearLogOnceKeys,
  createMemoryLogSink,
  getMemoryLogSinkEntries,
  removeLogSink,
} from '@flighthq/log/contract';
import {
  acquireWgpuRenderTexture,
  beginWgpuFrame,
  beginWgpuScreenRenderPassForTest,
  createWgpuRenderStateForTest,
  createWgpuRenderTexturePool,
  endWgpuRenderPass,
  installWgpuMock,
  writeWgpuRenderTextureTarget,
} from '@flighthq/render-wgpu/contract';
import type { LogEntry, Effect, WgpuEffectRunner, WgpuRenderState } from '@flighthq/types/contract';

import { areWgpuEffectGuardsEnabled, disableWgpuEffectGuards, enableWgpuEffectGuards } from './enableWgpuEffectGuards';
import { registerWgpuEffect } from './wgpuEffectRegistry';
import { beginWgpuEffectPass, createWgpuEffectState, endWgpuEffectPass } from './wgpuEffectState';
import { applyWgpuEffectsToRenderTexture } from './wgpuRenderTextureEffect';

beforeAll(() => installWgpuMock());
beforeEach(() => clearLogOnceKeys());

describe('areWgpuEffectGuardsEnabled', () => {
  it('reports whether diagnostics were installed for the state', async () => {
    const state = await createWgpuRenderStateForTest();
    expect(areWgpuEffectGuardsEnabled(state)).toBe(false);

    enableWgpuEffectGuards(state);
    expect(areWgpuEffectGuardsEnabled(state)).toBe(true);

    disableWgpuEffectGuards(state);
    expect(areWgpuEffectGuardsEnabled(state)).toBe(false);
  });
});

describe('disableWgpuEffectGuards', () => {
  it('stops reporting, leaving the silent sentinel silent again', async () => {
    const state = await createWgpuRenderStateForTest();
    enableWgpuEffectGuards(state);
    disableWgpuEffectGuards(state);

    const entries = captureLog(() => {
      expect(applyChain(state, ['test.wgpu-disabled-kind'])).toBe(false);
    });

    expect(entries.length).toBe(0);
  });
});

describe('enableWgpuEffectGuards', () => {
  // logOnce suppresses a key until the next test reset. Both the fire and silence assertions still live
  // in one test, in order, so the once-per-key behavior itself remains observable.
  it('WARNS that an unregistered chain returned false without writing dest, then stays quiet', async () => {
    const state = await createWgpuRenderStateForTest();
    enableWgpuEffectGuards(state);

    const entries = captureLog(() => {
      expect(applyChain(state, ['test.wgpu-unregistered-a'])).toBe(false);
    });

    expect(entries).toHaveLength(1);
    expect(messageOf(entries[0])).toContain('NEVER WRITTEN');
    expect(messageOf(entries[0])).toContain('registerWgpuEffect');

    const again = captureLog(() => {
      expect(applyChain(state, ['test.wgpu-unregistered-a'])).toBe(false);
    });

    expect(again).toHaveLength(0);
  });

  it('WARNS that a partially registered chain silently DROPPED the effects it could not run', async () => {
    const state = await createWgpuRenderStateForTest();
    enableWgpuEffectGuards(state);
    registerWgpuEffect(state, 'test.wgpu-registered-b', noopRunner);

    const entries = captureLog(() => {
      expect(applyChain(state, ['test.wgpu-registered-b', 'test.wgpu-unregistered-b'])).toBe(true);
    });

    expect(entries).toHaveLength(1);
    expect(messageOf(entries[0])).toContain('SKIPPED');
    expect(messageOf(entries[0])).toContain('test.wgpu-unregistered-b');
  });

  it('WARNS that a pipeline pass DROPPED an effect kind with no runner, once per kind', async () => {
    const state = await createWgpuRenderStateForTest();
    enableWgpuEffectGuards(state);
    const pipeline = createWgpuEffectState(state);
    const chain = [
      (() => {
        const out = allocateEntity<any>();
        out.kind = 'test.wgpu-pipeline-dropped-kind';
        return finishEntity(out);
      })(),
    ] as unknown as Readonly<Effect>[];

    const entries = captureLog(() => {
      const screenPass = beginWgpuScreenRenderPassForTest(state);
      endWgpuEffectPass(beginWgpuEffectPass(screenPass, pipeline), pipeline, chain);
      endWgpuRenderPass(screenPass);
    });

    expect(entries).toHaveLength(1);
    expect(messageOf(entries[0])).toContain('test.wgpu-pipeline-dropped-kind');
    expect(messageOf(entries[0])).toContain('SKIPPED');

    // Once per KIND, not once per frame: a chain missing the same effect every frame is one observation,
    // and a warning that repeated per frame would be its own defect.
    const again = captureLog(() => {
      const screenPass = beginWgpuScreenRenderPassForTest(state);
      endWgpuEffectPass(beginWgpuEffectPass(screenPass, pipeline), pipeline, chain);
      endWgpuRenderPass(screenPass);
    });

    expect(again).toHaveLength(0);
  });

  it('WARNS once when an unsupported sample count is substituted', async () => {
    const state = await createWgpuRenderStateForTest();
    enableWgpuEffectGuards(state);

    let pipeline = createWgpuEffectState(state);
    const entries = captureLog(() => {
      pipeline = createWgpuEffectState(state, { sampleCount: 8 });
      createWgpuEffectState(state, { sampleCount: 8 });
    });

    expect(pipeline.options.sampleCount).toBe(4);
    expect(entries).toHaveLength(1);
    expect(messageOf(entries[0])).toContain('sampleCount 8 requested');
    expect(messageOf(entries[0])).toContain('effect targets support 1 or 4');
    expect(messageOf(entries[0])).toContain('continuing with sampleCount 4');
    expect(messageOf(entries[0])).not.toContain('multisampling was NOT applied');
    expect(entries[0]?.data).toMatchObject({ appliedSampleCount: 4, requestedSampleCount: 8 });
  });

  it('stays SILENT when the requested sample counts are supported', async () => {
    const state = await createWgpuRenderStateForTest();
    enableWgpuEffectGuards(state);

    const entries = captureLog(() => {
      expect(createWgpuEffectState(state, { sampleCount: 1 }).options.sampleCount).toBe(1);
      expect(createWgpuEffectState(state, { sampleCount: 4 }).options.sampleCount).toBe(4);
    });

    expect(entries).toHaveLength(0);
  });

  it('stays SILENT for an empty chain, which is a no-op the caller asked for rather than a miss', async () => {
    const state = await createWgpuRenderStateForTest();
    enableWgpuEffectGuards(state);

    const entries = captureLog(() => {
      expect(applyChain(state, [])).toBe(false);
    });

    expect(entries).toHaveLength(0);
  });

  it('stays SILENT when every requested effect has a runner', async () => {
    const state = await createWgpuRenderStateForTest();
    enableWgpuEffectGuards(state);
    registerWgpuEffect(state, 'test.wgpu-registered-c', noopRunner);

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
  const effects = kinds.map(
    (kind) =>
      (() => {
        const out = allocateEntity<any>();
        out.kind = kind;
        return finishEntity(out) as unknown;
      })() as Readonly<Effect>,
  );
  return applyWgpuEffectsToRenderTexture(state, pool, source, dest, scratch, effects);
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

const noopRunner: WgpuEffectRunner = () => {};
