import type { WebGPURenderEffectRunner, WebGPURenderState } from '@flighthq/types';

// Per-state registry mapping an effect `type` string to its WebGPU runner — the material-renderer
// pattern one tier up. Registration is opt-in (import a runner only to register it) and dispatch is a
// Map lookup, so there is no monolithic switch and unused effect recipes tree-shake away. Register an
// alternative runner under the same key to swap algorithms. The WebGPU mirror of the effects-webgl
// renderEffectRegistry — the same agnostic RenderEffect[] drives both backends through their registries.

export function getWebGPURenderEffectRunner(state: WebGPURenderState, type: string): WebGPURenderEffectRunner | null {
  return _registries.get(state)?.get(type) ?? null;
}

export function registerWebGPURenderEffect(
  state: WebGPURenderState,
  type: string,
  runner: WebGPURenderEffectRunner,
): void {
  let registry = _registries.get(state);
  if (registry === undefined) {
    registry = new Map();
    _registries.set(state, registry);
  }
  registry.set(type, runner);
}

const _registries = new WeakMap<WebGPURenderState, Map<string, WebGPURenderEffectRunner>>();
