import { addLogSink, createMemoryLogSink, getMemoryLogSinkEntries, removeLogSink } from '@flighthq/log/contract';
import {
  acquireGlRenderTexture,
  createGlRenderState,
  createGlRenderTexturePool,
  writeGlRenderTextureTarget,
} from '@flighthq/render-gl/contract';
import type { GlRenderEffectRunner, GlRenderState, LogEntry, RenderEffect } from '@flighthq/types/contract';

import {
  areGlRenderEffectGuardsEnabled,
  disableGlRenderEffectGuards,
  enableGlRenderEffectGuards,
} from './enableGlRenderEffectGuards';
import { registerGlCustomShaderSource } from './glCustomShaderEffect';
import {
  beginGlRenderEffectPipeline,
  createGlRenderEffectPipeline,
  endGlRenderEffectPipeline,
} from './glRenderEffectPipeline';
import { registerGlRenderEffect } from './glRenderEffectRegistry';
import { applyGlRenderEffectsToRenderTexture } from './glRenderTextureEffect';

describe('areGlRenderEffectGuardsEnabled', () => {
  it('reports whether diagnostics were installed for the state', () => {
    const state = createState();
    expect(areGlRenderEffectGuardsEnabled(state)).toBe(false);

    enableGlRenderEffectGuards(state);
    expect(areGlRenderEffectGuardsEnabled(state)).toBe(true);

    disableGlRenderEffectGuards(state);
    expect(areGlRenderEffectGuardsEnabled(state)).toBe(false);
  });
});

describe('disableGlRenderEffectGuards', () => {
  it('stops reporting, leaving the silent sentinel silent again', () => {
    const state = createState();
    enableGlRenderEffectGuards(state);
    disableGlRenderEffectGuards(state);

    const entries = captureLog(() => {
      expect(applyChain(state, ['test.disabled-kind'])).toBe(false);
    });

    expect(entries.length).toBe(0);
  });
});

describe('enableGlRenderEffectGuards', () => {
  // logOnce suppresses a key for the whole PROCESS, so a fired key can never fire again in a later
  // test. Both the fire and the silence assertions live in this one test, in order, and every test in
  // this file uses distinct effect kinds so no two share a key.
  it('WARNS that an unregistered chain returned false without writing dest, then stays quiet', () => {
    const state = createState();
    enableGlRenderEffectGuards(state);

    const entries = captureLog(() => {
      expect(applyChain(state, ['test.unregistered-a'])).toBe(false);
    });
    expect(entries.length).toBe(1);
    // The consequence is the point: dest is never written, so the caller samples a stale texture.
    expect(messageOf(entries[0])).toContain('NEVER WRITTEN');
    expect(messageOf(entries[0])).toContain('registerGlRenderEffect');

    // Same observation again is suppressed — the miss recurs every frame and must not flood.
    const repeat = captureLog(() => {
      expect(applyChain(state, ['test.unregistered-a'])).toBe(false);
    });
    expect(repeat.length).toBe(0);
  });

  it('WARNS that a partially registered chain silently DROPPED the effects it could not run', () => {
    const state = createState();
    registerGlRenderEffect(state, 'test.registered-b', noopRunner);
    enableGlRenderEffectGuards(state);

    const entries = captureLog(() => {
      // It succeeds — which is exactly why this one is invisible without a crumb.
      expect(applyChain(state, ['test.registered-b', 'test.unregistered-b'])).toBe(true);
    });

    expect(entries.length).toBe(1);
    expect(messageOf(entries[0])).toContain('SKIPPED');
    expect(messageOf(entries[0])).toContain('test.unregistered-b');
  });

  it('WARNS when a failed chain leaves a previously published destination stale', () => {
    const state = createState();
    enableGlRenderEffectGuards(state);

    const entries = captureLog(() => {
      expect(applyChain(state, ['test.stale-destination'], true)).toBe(false);
    });

    expect(entries.length).toBe(1);
    expect(messageOf(entries[0])).toContain('STALE DESTINATION');
    expect(messageOf(entries[0])).toContain('handle the false return');
  });

  it('WARNS that re-registered shader source will NOT run, because the program is cached by key', () => {
    const state = createState();
    enableGlRenderEffectGuards(state);

    const entries = captureLog(() => {
      registerGlCustomShaderSource(state, 'test.reregistered-a', 'void main() { o_color = vec4(1.0); }');
      // Nothing fails and nothing throws — the edit simply never reaches the GPU.
      registerGlCustomShaderSource(state, 'test.reregistered-a', 'void main() { o_color = vec4(0.0); }');
    });

    expect(entries.length).toBe(1);
    expect(messageOf(entries[0])).toContain('will NOT run');
    expect(messageOf(entries[0])).toContain('test.reregistered-a');

    // Negative control for the guard itself: with the guard OFF the same sequence says nothing, so the
    // assertion above is measuring the guard rather than some other source of log traffic.
    disableGlRenderEffectGuards(state);
    const afterDisable = captureLog(() => {
      registerGlCustomShaderSource(state, 'test.reregistered-b', 'void main() { o_color = vec4(1.0); }');
      registerGlCustomShaderSource(state, 'test.reregistered-b', 'void main() { o_color = vec4(0.0); }');
    });
    expect(afterDisable.length).toBe(0);
  });

  it('WARNS that an unresolvable effect COPIED THROUGH rather than being dropped', () => {
    const state = createState();
    registerGlRenderEffect(state, 'test.unresolved-a', noopRunner, () => false);
    enableGlRenderEffectGuards(state);

    const entries = captureLog(() => {
      // It returns TRUE and writes dest — the pass ran, it just did nothing. That is the whole hazard.
      expect(applyChain(state, ['test.unresolved-a'])).toBe(true);
    });

    expect(entries.length).toBe(1);
    // The wrong picture is passthrough, not drop; saying "dropped" here would send the reader to the
    // registration call, which is already correct.
    expect(messageOf(entries[0])).toContain('COPIED THE INPUT THROUGH UNCHANGED');
    expect(messageOf(entries[0])).not.toContain('SKIPPED');
  });

  it('WARNS that a pipeline pass DROPPED an effect kind with no runner, once per kind', () => {
    const state = createState();
    enableGlRenderEffectGuards(state);
    const pipeline = createGlRenderEffectPipeline(state);

    const entries = captureLog(() => {
      beginGlRenderEffectPipeline(state, pipeline);
      endGlRenderEffectPipeline(state, pipeline, [{ kind: 'test.pipeline-dropped-kind' } as RenderEffect]);
    });

    expect(entries).toHaveLength(1);
    expect(messageOf(entries[0])).toContain('test.pipeline-dropped-kind');
    expect(messageOf(entries[0])).toContain('SKIPPED');

    // Once per KIND, not once per frame: a chain missing the same effect every frame is one
    // observation, and a warning that repeated per frame would be its own defect.
    const again = captureLog(() => {
      beginGlRenderEffectPipeline(state, pipeline);
      endGlRenderEffectPipeline(state, pipeline, [{ kind: 'test.pipeline-dropped-kind' } as RenderEffect]);
    });

    expect(again).toHaveLength(0);
  });

  it('stays SILENT for an empty chain, which is a no-op the caller asked for rather than a miss', () => {
    const state = createState();
    enableGlRenderEffectGuards(state);

    const entries = captureLog(() => {
      expect(applyChain(state, [])).toBe(false);
    });

    // Reporting this would train readers to ignore the crumb.
    expect(entries.length).toBe(0);
  });

  it('stays SILENT when every requested effect has a runner', () => {
    const state = createState();
    registerGlRenderEffect(state, 'test.registered-c', noopRunner);
    enableGlRenderEffectGuards(state);

    const entries = captureLog(() => {
      expect(applyChain(state, ['test.registered-c'])).toBe(true);
    });

    expect(entries.length).toBe(0);
  });
});

function applyChain(state: GlRenderState, kinds: readonly string[], publishDestination = false): boolean {
  const pool = createGlRenderTexturePool();
  const source = acquireGlRenderTexture(state, pool, { width: 8, height: 8 });
  const dest = acquireGlRenderTexture(state, pool, { width: 8, height: 8 });
  const scratch = acquireGlRenderTexture(state, pool, { width: 8, height: 8 });
  // Realize the source so `source-unavailable` is not what is being measured here.
  writeGlRenderTextureTarget(state, source, () => {});
  if (publishDestination) writeGlRenderTextureTarget(state, dest, () => {});
  const effects = kinds.map((kind) => ({ kind }) as unknown as Readonly<RenderEffect>);
  return applyGlRenderEffectsToRenderTexture(state, pool, source, dest, scratch, effects);
}

function captureLog(run: () => void): readonly LogEntry[] {
  const sink = createMemoryLogSink(8);
  addLogSink(sink.sink);
  try {
    run();
    return getMemoryLogSinkEntries(sink);
  } finally {
    removeLogSink(sink.sink);
  }
}

function createState(): GlRenderState {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 24;
  return createGlRenderState(canvas);
}

function messageOf(entry: Readonly<LogEntry>): string {
  const data = entry.data;
  return typeof data === 'string' ? data : String(data.message);
}

const noopRunner: GlRenderEffectRunner = () => {};
