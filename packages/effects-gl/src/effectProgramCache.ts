import { compileGlFullscreenProgram } from '@flighthq/render-gl';
import type { GlFullscreenProgram, GlRenderState } from '@flighthq/types';

// Per-state cache of compiled effect fragment programs, keyed by a stable string. Effect recipes call
// getGlEffectProgram with their own key + fragment source so each program compiles once per state
// and is reused every frame. Keeps compiled programs off the render-state runtime type.

export function getGlEffectProgram(state: GlRenderState, key: string, fragmentSource: string): GlFullscreenProgram {
  let cache = _programs.get(state);
  if (cache === undefined) {
    cache = new Map();
    _programs.set(state, cache);
  }
  const existing = cache.get(key);
  if (existing !== undefined) return existing;
  const compiled = compileGlFullscreenProgram(state.gl, fragmentSource);
  cache.set(key, compiled);
  return compiled;
}

const _programs = new WeakMap<GlRenderState, Map<string, GlFullscreenProgram>>();
