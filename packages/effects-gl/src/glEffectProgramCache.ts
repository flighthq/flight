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

// Returns a cached WebGLUniformLocation for the given program and uniform name. The texture-slot
// locations (u_texture0..N) are already resolved by compileGlFullscreenProgram and live on
// GlFullscreenProgram.textures. This cache covers the per-effect uniforms (u_threshold, u_intensity,
// u_matrix, etc.) that the render-gl layer does not pre-resolve. Because getUniformLocation is a
// GL driver call that involves string hashing on every draw, caching here removes O(N * uniforms)
// driver round-trips per frame for a 44-effect chain.
export function getGlEffectUniformLocation(
  state: GlRenderState,
  program: Readonly<GlFullscreenProgram>,
  name: string,
): WebGLUniformLocation | null {
  let cache = _uniformLocations.get(program);
  if (cache === undefined) {
    cache = new Map();
    _uniformLocations.set(program, cache);
  }
  const existing = cache.get(name);
  if (existing !== undefined) return existing;
  const loc = state.gl.getUniformLocation(program.program, name);
  cache.set(name, loc);
  return loc;
}

const _programs = new WeakMap<GlRenderState, Map<string, GlFullscreenProgram>>();

// Keyed by program object (not state) so the cache survives state-key rotation and is naturally
// freed when the program itself is garbage-collected (all GlFullscreenPrograms are stored in
// _programs above, which is already WeakMap-keyed by state).
const _uniformLocations = new WeakMap<Readonly<GlFullscreenProgram>, Map<string, WebGLUniformLocation | null>>();
