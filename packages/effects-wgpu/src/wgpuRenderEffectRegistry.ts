import { withRegistryTableEntry } from '@flighthq/registry/contract';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu/contract';
import type {
  RenderEffect,
  WgpuRenderEffectResolver,
  WgpuRenderEffectRunner,
  WgpuRenderState,
} from '@flighthq/types/contract';
import { RegistryEntryState } from '@flighthq/types/contract';

// Per-state registry mapping an effect `kind` string to its Wgpu runner — the material-renderer
// pattern one tier up. Registration is opt-in (import a runner only to register it) and dispatch is a
// Map lookup, so there is no monolithic switch and unused effect recipes tree-shake away. Register an
// alternative runner under the same key to swap algorithms. The Wgpu mirror of the effects-gl
// renderEffectRegistry — the same agnostic RenderEffect[] drives both backends through their registries.
// A built-in registerWgpu<Kind>Effect wrapper is pure ergonomics: it calls this function with the
// literal kind and public default runner, and installs no padding, shader-source, or backdrop companions.

export function getWgpuRenderEffectRunner(state: WgpuRenderState, kind: string): WgpuRenderEffectRunner | null {
  const entry = getWgpuRenderStateRuntime(state).registries.renderEffects.entries.get(kind);
  return entry?.state === RegistryEntryState.Bound ? entry.value.runner : null;
}

// Returns true if a runner is registered for the given kind in this state. Symmetric with
// hasGlRenderEffectRunner. Use to validate an effect chain before dispatching — the pipeline
// silently skips unregistered kinds; check up front to apply your own policy (warn, filter)
// rather than relying on silent no-ops.
export function hasWgpuRenderEffectRunner(state: WgpuRenderState, kind: string): boolean {
  return (
    getWgpuRenderStateRuntime(state).registries.renderEffects.entries.get(kind)?.state === RegistryEntryState.Bound
  );
}

export function isWgpuRenderEffectResolvable(state: WgpuRenderState, effect: Readonly<RenderEffect>): boolean {
  const entry = getWgpuRenderStateRuntime(state).registries.renderEffects.entries.get(effect.kind);
  if (entry?.state !== RegistryEntryState.Bound) return false;
  return entry.value.isResolvable === undefined || entry.value.isResolvable(state, effect);
}

export function registerWgpuRenderEffect(
  state: WgpuRenderState,
  kind: string,
  runner: WgpuRenderEffectRunner,
  isResolvable?: WgpuRenderEffectResolver,
): void {
  const runtime = getWgpuRenderStateRuntime(state);
  runtime.registries.renderEffects = withRegistryTableEntry(runtime.registries.renderEffects, kind, {
    isResolvable,
    runner,
  });
}
