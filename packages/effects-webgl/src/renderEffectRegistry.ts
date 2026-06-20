import type { WebGLRenderEffectRunner, WebGLRenderState } from '@flighthq/types';

// Per-state registry mapping an effect `type` string to its WebGL runner — the material-renderer
// pattern one tier up. Registration is opt-in (import a runner only to register it) and dispatch is a
// Map lookup, so there is no monolithic switch and unused effect recipes tree-shake away. Register an
// alternative runner under the same key to swap algorithms.

export function getWebGLRenderEffectRunner(state: WebGLRenderState, type: string): WebGLRenderEffectRunner | null {
  return _registries.get(state)?.get(type) ?? null;
}

export function registerWebGLRenderEffect(
  state: WebGLRenderState,
  type: string,
  runner: WebGLRenderEffectRunner,
): void {
  let registry = _registries.get(state);
  if (registry === undefined) {
    registry = new Map();
    _registries.set(state, registry);
  }
  registry.set(type, runner);
}

const _registries = new WeakMap<WebGLRenderState, Map<string, WebGLRenderEffectRunner>>();
