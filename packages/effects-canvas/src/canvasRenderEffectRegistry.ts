import { getCanvasRenderStateRuntime } from '@flighthq/scene2d-canvas/contract';
import type { CanvasRenderEffectRunner, CanvasRenderState } from '@flighthq/types/contract';

// Per-state registry mapping an effect `kind` string to its Canvas 2D runner — the material-renderer
// pattern one tier up, and the Canvas parallel of registerGlRenderEffect. Registration is opt-in
// (import a runner only to register it) and dispatch is a Map lookup, so there is no monolithic switch
// and unused effect recipes tree-shake away. Register an alternative runner under the same key to swap
// algorithms. A built-in registerCanvas<Kind>Effect wrapper is pure ergonomics: it calls this function
// with the literal kind and public default runner, and installs no padding or shader companions.

export function getCanvasRenderEffectRunner(state: CanvasRenderState, kind: string): CanvasRenderEffectRunner | null {
  return getCanvasRenderStateRuntime(state).canvasRenderEffectRegistry?.get(kind) ?? null;
}

// Returns true if a runner is registered for the given kind in this state. Use to validate an effect
// chain before dispatching. The pipeline preserves unregistered operations as initialized identity
// passes; check up front to apply your own policy (warn, filter) rather than relying on that fallback.
export function hasCanvasRenderEffectRunner(state: CanvasRenderState, kind: string): boolean {
  return getCanvasRenderStateRuntime(state).canvasRenderEffectRegistry?.has(kind) ?? false;
}

export function registerCanvasRenderEffect(
  state: CanvasRenderState,
  kind: string,
  runner: CanvasRenderEffectRunner,
): void {
  const runtime = getCanvasRenderStateRuntime(state);
  (runtime.canvasRenderEffectRegistry ??= new Map()).set(kind, runner);
}
