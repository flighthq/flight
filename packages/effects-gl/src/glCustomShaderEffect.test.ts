import { createCustomShaderEffect } from '@flighthq/effects/contract';
import { getRegistryTableEntry } from '@flighthq/registry/contract';
import {
  createEmptyGlRegistries,
  createGlContextState,
  createGlPipeline,
  createGlRenderStateRuntime,
  getGlRenderStateRuntime,
} from '@flighthq/render-gl/contract';
import type { GlPipeline, GlRenderState } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import {
  applyCustomShaderEffectToGl,
  defaultGlCustomShaderEffectRunner,
  getGlCustomShaderSource,
  isGlCustomShaderEffectResolvable,
  registerGlCustomShaderSource,
  registerGlCustomShaderEffect,
  setGlCustomShaderSourceGuard,
} from './glCustomShaderEffect';

const testPipeline = createGlPipeline(createEmptyGlRegistries());

function makeState(pipeline: Readonly<GlPipeline> = testPipeline): GlRenderState {
  const gl = document.createElement('canvas').getContext('webgl2')!;
  const contextState = createGlContextState(gl);
  return {
    [EntityRuntimeKey]: createGlRenderStateRuntime(contextState, pipeline),
    contextState,
    gl,
    pipeline,
  } as unknown as GlRenderState;
}

const FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
out vec4 o_color;
void main() { o_color = texture(u_texture0, v_texCoord); }`;

describe('applyCustomShaderEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyCustomShaderEffectToGl).toBe('function');
  });
});

describe('defaultGlCustomShaderEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlCustomShaderEffectRunner).toBe('function');
  });
});

describe('getGlCustomShaderSource', () => {
  it('returns null when no source is registered for the key', () => {
    expect(getGlCustomShaderSource(makeState(), 'missing')).toBeNull();
  });

  it('returns the source registered under the key', () => {
    const state = makeState();
    registerGlCustomShaderSource(state, 'ripple', FRAGMENT_SRC);
    expect(getGlCustomShaderSource(state, 'ripple')).toBe(FRAGMENT_SRC);
  });

  it('isolates sources per render state', () => {
    const a = makeState();
    const b = makeState();
    registerGlCustomShaderSource(a, 'ripple', FRAGMENT_SRC);
    expect(getGlCustomShaderSource(b, 'ripple')).toBeNull();
  });
});

describe('isGlCustomShaderEffectResolvable', () => {
  it('is false for a shaderKey with no registered source, which is the identity-passthrough case', () => {
    const state = makeState();
    expect(isGlCustomShaderEffectResolvable(state, createCustomShaderEffect({ shaderKey: 'ripple' }) as never)).toBe(
      false,
    );
  });

  it('is true once the key names registered source', () => {
    const state = makeState();
    registerGlCustomShaderSource(state, 'ripple', FRAGMENT_SRC);
    expect(isGlCustomShaderEffectResolvable(state, createCustomShaderEffect({ shaderKey: 'ripple' }) as never)).toBe(
      true,
    );
  });

  it('answers per effect instance, so two effects of this kind can disagree', () => {
    const state = makeState();
    registerGlCustomShaderSource(state, 'ripple', FRAGMENT_SRC);
    const registered = createCustomShaderEffect({ shaderKey: 'ripple' }) as never;
    const missing = createCustomShaderEffect({ shaderKey: 'absent' }) as never;
    expect(isGlCustomShaderEffectResolvable(state, registered)).toBe(true);
    expect(isGlCustomShaderEffectResolvable(state, missing)).toBe(false);
  });
});

describe('registerGlCustomShaderEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlCustomShaderEffect).toBeTypeOf('function');
  });
});

describe('registerGlCustomShaderSource', () => {
  it('registers a source that getGlCustomShaderSource then resolves', () => {
    const state = makeState();
    registerGlCustomShaderSource(state, 'ripple', FRAGMENT_SRC);
    expect(getGlCustomShaderSource(state, 'ripple')).toBe(FRAGMENT_SRC);
  });

  it('is last-write-wins for a given key', () => {
    const state = makeState();
    const replacement = FRAGMENT_SRC.replace('texture(u_texture0, v_texCoord)', 'vec4(1.0)');
    registerGlCustomShaderSource(state, 'ripple', FRAGMENT_SRC);
    registerGlCustomShaderSource(state, 'ripple', replacement);
    expect(getGlCustomShaderSource(state, 'ripple')).toBe(replacement);
  });

  it('replaces the persistent table while an explicitly copied state retains its snapshot', () => {
    const screen = makeState();
    const replacement = FRAGMENT_SRC.replace('texture(u_texture0, v_texCoord)', 'vec4(1.0)');
    registerGlCustomShaderSource(screen, 'ripple', FRAGMENT_SRC);
    const snapshot = getGlRenderStateRuntime(screen).registries.customEffectShaders;
    const derived = makeState(createGlPipeline(getGlRenderStateRuntime(screen).registries));

    registerGlCustomShaderSource(screen, 'ripple', replacement);

    expect(getGlRenderStateRuntime(derived).registries.customEffectShaders).toBe(snapshot);
    expect(getGlRenderStateRuntime(screen).registries.customEffectShaders).not.toBe(snapshot);
    expect(getRegistryTableEntry(snapshot, 'ripple')).toBe(FRAGMENT_SRC);
    expect(getGlCustomShaderSource(derived, 'ripple')).toBe(FRAGMENT_SRC);
    expect(getGlCustomShaderSource(screen, 'ripple')).toBe(replacement);
  });
});

describe('setGlCustomShaderSourceGuard', () => {
  it('fires with both sources when a key is overwritten with DIFFERENT source', () => {
    const state = makeState();
    const replacement = FRAGMENT_SRC.replace('texture(u_texture0, v_texCoord)', 'vec4(1.0)');
    const calls: { key: string; previous: string; next: string }[] = [];
    setGlCustomShaderSourceGuard(state, (_state, key, previous, next) => calls.push({ key, next, previous }));

    registerGlCustomShaderSource(state, 'ripple', FRAGMENT_SRC);
    registerGlCustomShaderSource(state, 'ripple', replacement);

    // Both sources, because the whole point is that the NEXT one never reaches the GPU.
    expect(calls).toEqual([{ key: 'ripple', next: replacement, previous: FRAGMENT_SRC }]);
    // Non-vacuous: the registry still took the write, so the guard reports rather than blocks.
    expect(getGlCustomShaderSource(state, 'ripple')).toBe(replacement);
  });

  it('stays SILENT on the first registration of a key, which compiles the source it names', () => {
    const state = makeState();
    let calls = 0;
    setGlCustomShaderSourceGuard(state, () => calls++);

    registerGlCustomShaderSource(state, 'ripple', FRAGMENT_SRC);

    expect(calls).toBe(0);
    expect(getGlCustomShaderSource(state, 'ripple')).toBe(FRAGMENT_SRC);
  });

  it('stays SILENT when the SAME source is registered again, which changes nothing', () => {
    const state = makeState();
    let calls = 0;
    setGlCustomShaderSourceGuard(state, () => calls++);

    registerGlCustomShaderSource(state, 'ripple', FRAGMENT_SRC);
    registerGlCustomShaderSource(state, 'ripple', FRAGMENT_SRC);

    // The cached program IS this source, so warning here would train readers to ignore the crumb.
    expect(calls).toBe(0);
  });

  it('stops firing once cleared, and never fires for a state that never installed one', () => {
    const state = makeState();
    const other = makeState();
    const replacement = FRAGMENT_SRC.replace('texture(u_texture0, v_texCoord)', 'vec4(1.0)');
    let calls = 0;
    setGlCustomShaderSourceGuard(state, () => calls++);
    setGlCustomShaderSourceGuard(state, null);

    registerGlCustomShaderSource(state, 'ripple', FRAGMENT_SRC);
    registerGlCustomShaderSource(state, 'ripple', replacement);
    registerGlCustomShaderSource(other, 'ripple', FRAGMENT_SRC);
    registerGlCustomShaderSource(other, 'ripple', replacement);

    expect(calls).toBe(0);
  });
});
