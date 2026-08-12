import { createKeyedTable, withRegistryTableEntry, withoutRegistryTableEntry } from '@flighthq/registry/contract';
import { getRenderStateRuntime } from '@flighthq/render/contract';
import type {
  Kind,
  RenderEffect,
  RenderEffectPadding,
  RenderEffectPaddingExplanation,
  RenderEffectPaddingResolver,
  RenderState,
} from '@flighthq/types/contract';
import { RegistryEntryState, RenderRegistry } from '@flighthq/types/contract';

// Computes the footprint of one effect or a sequential effect chain. Spatial effects add their
// directional footprints per side; pointwise effects register the zero resolver. An unregistered kind
// contributes the silent zero sentinel and emits only through the opt-in shared registry-miss signal.
export function computeRenderEffectPadding(
  state: RenderState,
  effects: Readonly<RenderEffect> | ReadonlyArray<Readonly<RenderEffect>>,
): RenderEffectPadding {
  const list = Array.isArray(effects) ? effects : [effects];
  const explanation = explainRenderEffectPadding(state, list);
  const emitMiss = getRenderStateRuntime(state).registryMiss;
  if (emitMiss !== null)
    for (const kind of explanation.missingKinds) emitMiss(RenderRegistry.EffectPaddingResolver, kind);
  return explanation.padding;
}

export function explainRenderEffectPadding(
  state: RenderState,
  effects: Readonly<RenderEffect> | ReadonlyArray<Readonly<RenderEffect>>,
): RenderEffectPaddingExplanation {
  const list = Array.isArray(effects) ? effects : [effects];
  const entries = getRenderStateRuntime(state).registries.effectPaddingResolvers?.entries;
  let bottom = 0;
  let left = 0;
  let right = 0;
  let top = 0;
  const missingKinds: Kind[] = [];
  for (const effect of list) {
    const entry = entries?.get(effect.kind);
    if (entry?.state !== RegistryEntryState.Bound) {
      if (!missingKinds.includes(effect.kind)) missingKinds.push(effect.kind);
      continue;
    }
    const padding = entry.value(effect);
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

// Adds a screen-space Y-down offset to a Gaussian footprint without wasting the opposite inset.
export function getDirectionalRenderEffectPadding(
  blurX: number,
  blurY: number,
  offsetX: number,
  offsetY: number,
): RenderEffectPadding {
  const gaussian = getGaussianRenderEffectPadding(blurX, blurY);
  const dx = Math.abs(offsetX) < 1e-10 ? 0 : offsetX;
  const dy = Math.abs(offsetY) < 1e-10 ? 0 : offsetY;
  return {
    bottom: Math.ceil(gaussian.bottom + Math.max(0, dy)),
    left: Math.ceil(gaussian.left + Math.max(0, -dx)),
    right: Math.ceil(gaussian.right + Math.max(0, dx)),
    top: Math.ceil(gaussian.top + Math.max(0, -dy)),
  };
}

// Converts Gaussian standard deviations into the three-sigma footprint used by the per-node lane.
export function getGaussianRenderEffectPadding(blurX: number, blurY: number): RenderEffectPadding {
  const horizontal = Math.ceil(Math.max(0, blurX) * 3);
  const vertical = Math.ceil(Math.max(0, blurY) * 3);
  return { bottom: vertical, left: horizontal, right: horizontal, top: vertical };
}

export function registerRenderEffectPaddingResolver(
  state: RenderState,
  kind: Kind,
  resolver: RenderEffectPaddingResolver | null,
): void {
  const runtime = getRenderStateRuntime(state);
  const table = runtime.registries.effectPaddingResolvers;
  if (resolver === null) {
    if (table !== undefined) runtime.registries.effectPaddingResolvers = withoutRegistryTableEntry(table, kind);
    return;
  }
  runtime.registries.effectPaddingResolvers = withRegistryTableEntry(
    table ?? createKeyedTable('RenderEffectPaddingResolver', 'Zero'),
    kind,
    resolver,
  );
}

function sanitizePadding(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}
