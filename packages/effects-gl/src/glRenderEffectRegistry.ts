import { withRegistryTableEntry } from '@flighthq/registry/contract';
import { getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import type {
  GlRenderEffectResolver,
  GlRenderEffectRunner,
  GlRenderState,
  RenderEffect,
} from '@flighthq/types/contract';
import { RegistryEntryState } from '@flighthq/types/contract';

// Per-state registry mapping an effect `kind` string to its Gl runner — the material-renderer
// pattern one tier up. Registration is opt-in (import a runner only to register it) and dispatch is a
// Map lookup, so there is no monolithic switch and unused effect recipes tree-shake away. Register an
// alternative runner under the same key to swap algorithms. A built-in registerGl<Kind>Effect wrapper
// is pure ergonomics: it calls this function with the literal kind and public default runner, and
// installs no padding, shader-source, or backdrop companions.

export function getGlRenderEffectRunner(state: GlRenderState, kind: string): GlRenderEffectRunner | null {
  const entry = getGlRenderStateRuntime(state).registries.renderEffects.entries.get(kind);
  return entry?.state === RegistryEntryState.Bound ? entry.value.runner : null;
}

// Returns true if a runner is registered for the given kind in this state. Use to validate an effect
// chain before dispatching — the pipeline silently skips unregistered kinds; check up front to apply
// your own policy (warn, throw, filter) rather than relying on silent no-ops.
export function hasGlRenderEffectRunner(state: GlRenderState, kind: string): boolean {
  return getGlRenderStateRuntime(state).registries.renderEffects.entries.get(kind)?.state === RegistryEntryState.Bound;
}

// Whether this specific effect INSTANCE can resolve into a real pass — a separate axis from whether its
// kind has a runner. A kind registered without a resolver is always resolvable; an unregistered kind is
// not resolvable because there is nothing to resolve it with, which the pipeline reports as a
// registration miss rather than a resolution one.
export function isGlRenderEffectResolvable(state: GlRenderState, effect: Readonly<RenderEffect>): boolean {
  const entry = getGlRenderStateRuntime(state).registries.renderEffects.entries.get(effect.kind);
  if (entry?.state !== RegistryEntryState.Bound) return false;
  return entry.value.isResolvable === undefined || entry.value.isResolvable(state, effect);
}

// `isResolvable` is optional and belongs to THIS call rather than a registry of its own: a runner that
// silently degrades when what it names is missing (a shaderKey with no source, a LUT not yet loaded)
// declares how to detect that here, so the pipeline can report a passthrough instead of calling it
// complete. Registering the two together makes the runner-without-resolver gap unrepresentable rather
// than merely detectable.
export function registerGlRenderEffect(
  state: GlRenderState,
  kind: string,
  runner: GlRenderEffectRunner,
  isResolvable?: GlRenderEffectResolver,
): void {
  const runtime = getGlRenderStateRuntime(state);
  runtime.registries.renderEffects = withRegistryTableEntry(runtime.registries.renderEffects, kind, {
    isResolvable,
    runner,
  });
}
