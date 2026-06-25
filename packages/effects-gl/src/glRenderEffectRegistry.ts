import type { GlRenderEffectRunner, GlRenderState } from '@flighthq/types';

// Per-state registry mapping an effect `kind` string to its Gl runner — the material-renderer
// pattern one tier up. Registration is opt-in (import a runner only to register it) and dispatch is a
// Map lookup, so there is no monolithic switch and unused effect recipes tree-shake away. Register an
// alternative runner under the same key to swap algorithms.

export function getGlRenderEffectRunner(state: GlRenderState, kind: string): GlRenderEffectRunner | null {
  return _registries.get(state)?.get(kind) ?? null;
}

// Returns true if a runner is registered for the given kind in this state. Use to validate an effect
// chain before dispatching — the pipeline silently skips unregistered kinds; check up front to apply
// your own policy (warn, throw, filter) rather than relying on silent no-ops.
export function hasGlRenderEffectRunner(state: GlRenderState, kind: string): boolean {
  return _registries.get(state)?.has(kind) ?? false;
}

export function registerGlRenderEffect(state: GlRenderState, kind: string, runner: GlRenderEffectRunner): void {
  let registry = _registries.get(state);
  if (registry === undefined) {
    registry = new Map();
    _registries.set(state, registry);
  }
  registry.set(kind, runner);
}

const _registries = new WeakMap<GlRenderState, Map<string, GlRenderEffectRunner>>();
