import { withKindMapEntry } from '@flighthq/registry/contract';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu/contract';
import type { Effect, WgpuEffectResolver, WgpuEffectRunner, WgpuRenderState } from '@flighthq/types/contract';

// Per-state registry mapping an effect `kind` string to its Wgpu runner — the material-renderer
// pattern one tier up. Registration is opt-in (import a runner only to register it) and dispatch is a
// Map lookup, so there is no monolithic switch and unused effect recipes tree-shake away. Register an
// alternative runner under the same key to swap algorithms. The Wgpu mirror of the effects-gl
// effectRegistry — the same agnostic Effect[] drives both backends through their registries.
// A built-in registerWgpu<Kind>Effect wrapper is pure ergonomics: it calls this function with the
// literal kind and public default runner, and installs no padding, shader-source, or backdrop companions.

export function getWgpuEffectRunner(state: WgpuRenderState, kind: string): WgpuEffectRunner | null {
  const entry = getWgpuRenderStateRuntime(state).registries.effects.get(kind);
  return entry?.runner ?? null;
}

// Returns true if a runner is registered for the given kind in this state. Symmetric with
// hasGlEffectRunner. Use to validate an effect chain before dispatching — the pipeline
// silently skips unregistered kinds; check up front to apply your own policy (warn, filter)
// rather than relying on silent no-ops.
export function hasWgpuEffectRunner(state: WgpuRenderState, kind: string): boolean {
  return getWgpuRenderStateRuntime(state).registries.effects.has(kind);
}

export function isWgpuEffectResolvable(state: WgpuRenderState, effect: Readonly<Effect>): boolean {
  const entry = getWgpuRenderStateRuntime(state).registries.effects.get(effect.kind);
  if (entry == null) return false;
  return entry.isResolvable === undefined || entry.isResolvable(state, effect);
}

export function registerWgpuEffect(
  state: WgpuRenderState,
  kind: string,
  runner: WgpuEffectRunner,
  isResolvable?: WgpuEffectResolver,
): void {
  const runtime = getWgpuRenderStateRuntime(state);
  runtime.registries.effects = withKindMapEntry(runtime.registries.effects, kind, {
    isResolvable,
    runner,
  });
}
