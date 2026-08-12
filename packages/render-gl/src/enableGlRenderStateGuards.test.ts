import { setLogSink } from '@flighthq/log/contract';
import { getRenderStateRuntime } from '@flighthq/render/contract';
import type { LogEntry } from '@flighthq/types/contract';
import { RegistryEntryState } from '@flighthq/types/contract';

import { areGlRenderStateGuardsEnabled, enableGlRenderStateGuards } from './enableGlRenderStateGuards';
import { useGlProgram } from './glDraw';
import { createGlRenderState, getGlRenderStateRuntime } from './glRenderState';
import { makeGL } from './glTestHelper';

function createState() {
  const canvas = document.createElement('canvas');
  canvas.getContext = vi.fn().mockReturnValue(makeGL()) as typeof canvas.getContext;
  return createGlRenderState(canvas);
}

describe('areGlRenderStateGuardsEnabled', () => {
  it('reports whether the state-local multiple-root guard is installed', () => {
    const state = createState();
    expect(areGlRenderStateGuardsEnabled(state)).toBe(false);
    enableGlRenderStateGuards(state);
    expect(areGlRenderStateGuardsEnabled(state)).toBe(true);
  });
});

describe('enableGlRenderStateGuards', () => {
  it('installs the state-local multiple-root guard idempotently', () => {
    const state = createState();
    enableGlRenderStateGuards(state);
    const table = getRenderStateRuntime(state).registries.renderRootGuard;
    expect(table).toMatchObject({
      entry: { state: RegistryEntryState.Bound },
      onMiss: 'Disabled',
      registry: 'RenderRootGuard',
      shape: 'slot',
    });
    enableGlRenderStateGuards(state);
    expect(areGlRenderStateGuardsEnabled(state)).toBe(true);
    expect(getRenderStateRuntime(state).registries.renderRootGuard).toBe(table);
  });
});

describe('foreign GL binding guard', () => {
  afterEach(() => setLogSink(null));

  function messages(entries: LogEntry[]): string {
    return entries.map((e) => String((e.data as { message?: unknown } | undefined)?.message ?? '')).join('\n');
  }

  // Both directions live in ONE test on purpose: logOnce suppresses a key for the process, so a
  // separate silence test would pass whether or not the guard checks anything, once the warn test has
  // consumed the key. Silence is asserted FIRST, while the key is still unconsumed.
  //
  // render-gl skips a redundant useProgram by trusting its cache, which is only sound while it is the
  // sole writer of GL state. A guest renderer that binds its own program without calling
  // invalidateGlRenderStateCache breaks that, and the real symptom is a GL error blamed on a LATER
  // uniform call in render-gl rather than on the renderer that changed the binding.
  it('warns only when the bound program differs from the one render-gl cached', () => {
    const entries: LogEntry[] = [];
    setLogSink((entry) => entries.push(entry));
    const state = createState();
    enableGlRenderStateGuards(state);
    const runtime = getGlRenderStateRuntime(state);
    const cached = {} as WebGLProgram;

    // Matching: GL has exactly what render-gl believes, so the skip is sound and nothing is reported.
    state.gl.getParameter = vi.fn().mockReturnValue(cached) as typeof state.gl.getParameter;
    runtime.bindingCacheGuard!(state, cached);
    expect(messages(entries)).toBe('');

    // Mismatching: a guest renderer bound something else and never restored it.
    state.gl.getParameter = vi.fn().mockReturnValue({} as WebGLProgram) as typeof state.gl.getParameter;
    runtime.bindingCacheGuard!(state, cached);
    expect(messages(entries)).toContain('invalidateGlRenderStateCache');
  });

  it('installs no binding guard until the guards are enabled', () => {
    expect(getGlRenderStateRuntime(createState()).bindingCacheGuard).toBeNull();
  });
});
