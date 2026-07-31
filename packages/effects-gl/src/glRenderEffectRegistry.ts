import { getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import type { GlRenderEffectRunner, GlRenderState } from '@flighthq/types/contract';

// Per-state registry mapping an effect `kind` string to its Gl runner — the material-renderer
// pattern one tier up. Registration is opt-in (import a runner only to register it) and dispatch is a
// Map lookup, so there is no monolithic switch and unused effect recipes tree-shake away. Register an
// alternative runner under the same key to swap algorithms. A built-in registerGl<Kind>Effect wrapper
// is pure ergonomics: it calls this function with the literal kind and public default runner, and
// installs no padding, shader-source, or backdrop companions.

export function getGlRenderEffectRunner(state: GlRenderState, kind: string): GlRenderEffectRunner | null {
  return getGlRenderStateRuntime(state).glRenderEffectRegistry?.get(kind) ?? null;
}

// Returns true if a runner is registered for the given kind in this state. Use to validate an effect
// chain before dispatching — the pipeline silently skips unregistered kinds; check up front to apply
// your own policy (warn, throw, filter) rather than relying on silent no-ops.
export function hasGlRenderEffectRunner(state: GlRenderState, kind: string): boolean {
  return getGlRenderStateRuntime(state).glRenderEffectRegistry?.has(kind) ?? false;
}

export function registerGlRenderEffect(state: GlRenderState, kind: string, runner: GlRenderEffectRunner): void {
  const runtime = getGlRenderStateRuntime(state);
  (runtime.glRenderEffectRegistry ??= new Map()).set(kind, runner);
}
