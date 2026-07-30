import { getRenderStateRuntime } from '@flighthq/render/contract';
import { emitSignal } from '@flighthq/signals/contract';
import type {
  Kind,
  RenderEffect,
  RenderEffectPadding,
  RenderEffectPaddingExplanation,
  RenderEffectPaddingResolver,
  RenderState,
} from '@flighthq/types/contract';
import { RenderRegistry } from '@flighthq/types/contract';

// Computes the footprint of one effect or a sequential effect chain. Spatial effects add their
// directional footprints per side; pointwise effects register the zero resolver. An unregistered kind
// contributes the silent zero sentinel and emits only through the opt-in shared registry-miss signal.
export function computeRenderEffectPadding(
  state: RenderState,
  effects: Readonly<RenderEffect> | ReadonlyArray<Readonly<RenderEffect>>,
): RenderEffectPadding {
  const list = Array.isArray(effects) ? effects : [effects];
  const explanation = explainRenderEffectPadding(state, list);
  const signals = getRenderStateRuntime(state).registrySignals;
  if (signals !== null) {
    for (const kind of explanation.missingKinds) {
      emitSignal(signals.onRegistryMiss, RenderRegistry.EffectPaddingResolver, kind);
    }
  }
  return explanation.padding;
}

export function explainRenderEffectPadding(
  state: RenderState,
  effects: Readonly<RenderEffect> | ReadonlyArray<Readonly<RenderEffect>>,
): RenderEffectPaddingExplanation {
  const list = Array.isArray(effects) ? effects : [effects];
  const registry = getRenderStateRuntime(state).renderEffectPaddingResolverRegistry;
  let bottom = 0;
  let left = 0;
  let right = 0;
  let top = 0;
  const missingKinds: Kind[] = [];
  for (const effect of list) {
    const resolver = registry?.get(effect.kind);
    if (resolver === undefined) {
      if (!missingKinds.includes(effect.kind)) missingKinds.push(effect.kind);
      continue;
    }
    const padding = resolver(effect);
    bottom += sanitizePadding(padding.bottom);
    left += sanitizePadding(padding.left);
    right += sanitizePadding(padding.right);
    top += sanitizePadding(padding.top);
  }
  return {
    missingKinds,
    padding: { bottom, left, right, top },
    status: missingKinds.length === 0 ? 'complete' : 'missing-resolver',
  };
}

export function registerRenderEffectPaddingResolver(
  state: RenderState,
  kind: Kind,
  resolver: RenderEffectPaddingResolver | null,
): void {
  const runtime = getRenderStateRuntime(state);
  if (resolver === null) runtime.renderEffectPaddingResolverRegistry?.delete(kind);
  else (runtime.renderEffectPaddingResolverRegistry ??= new Map()).set(kind, resolver);
}

function sanitizePadding(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}
