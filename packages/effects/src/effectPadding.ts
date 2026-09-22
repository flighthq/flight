import { withKindMapEntry, withoutKindMapEntry } from '@flighthq/registry/contract';
import { getRenderStateRuntime } from '@flighthq/render/contract';
import type {
  Kind,
  Effect,
  EffectPadding,
  EffectPaddingExplanation,
  EffectPaddingResolver,
  RenderState,
} from '@flighthq/types/contract';
import { RenderRegistryTable } from '@flighthq/types/contract';

// Computes the footprint of one effect or a sequential effect chain. Spatial effects add their
// directional footprints per side; pointwise effects register the zero resolver. An unregistered kind
// contributes the silent zero sentinel and emits only through the opt-in shared registry-miss signal.
export function computeEffectPadding(
  state: RenderState,
  effects: Readonly<Effect> | ReadonlyArray<Readonly<Effect>>,
  out?: EffectPadding,
): EffectPadding {
  if (out !== undefined) {
    writeEffectPadding(out, state, effects, null, getRenderStateRuntime(state).registryMiss);
    return out;
  }
  const list = Array.isArray(effects) ? effects : [effects];
  const explanation = explainEffectPadding(state, list);
  const emitMiss = getRenderStateRuntime(state).registryMiss;
  if (emitMiss !== null)
    for (const kind of explanation.missingKinds) emitMiss(RenderRegistryTable.EffectPaddingResolver, kind);
  return explanation.padding;
}

export function explainEffectPadding(
  state: RenderState,
  effects: Readonly<Effect> | ReadonlyArray<Readonly<Effect>>,
): EffectPaddingExplanation {
  const missingKinds: Kind[] = [];
  const padding: EffectPadding = { bottom: 0, left: 0, right: 0, top: 0 };
  writeEffectPadding(padding, state, effects, missingKinds, null);
  return {
    missingKinds,
    padding,
    status: missingKinds.length === 0 ? 'complete' : 'missing-resolver',
  };
}

// Adds a screen-space Y-down offset to a Gaussian footprint without wasting the opposite inset.
export function getDirectionalEffectPadding(
  blurX: number,
  blurY: number,
  offsetX: number,
  offsetY: number,
): EffectPadding {
  const gaussian = getGaussianEffectPadding(blurX, blurY);
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
export function getGaussianEffectPadding(blurX: number, blurY: number): EffectPadding {
  const horizontal = Math.ceil(Math.max(0, blurX) * 3);
  const vertical = Math.ceil(Math.max(0, blurY) * 3);
  return { bottom: vertical, left: horizontal, right: horizontal, top: vertical };
}

export function registerEffectPaddingResolver(
  state: RenderState,
  kind: Kind,
  resolver: EffectPaddingResolver | null,
): void {
  const runtime = getRenderStateRuntime(state);
  const table = runtime.registries.effectPaddingResolvers;
  if (resolver === null) {
    if (table !== undefined) runtime.registries.effectPaddingResolvers = withoutKindMapEntry(table, kind);
    return;
  }
  runtime.registries.effectPaddingResolvers = withKindMapEntry(table ?? new Map(), kind, resolver);
}

function writeEffectPadding(
  out: EffectPadding,
  state: RenderState,
  effects: Readonly<Effect> | ReadonlyArray<Readonly<Effect>>,
  missingKinds: Kind[] | null,
  emitMiss: ((registry: RenderRegistryTable, kind: Kind) => void) | null,
): void {
  const list = Array.isArray(effects) ? effects : null;
  const length = list === null ? 1 : list.length;
  const resolvers = getRenderStateRuntime(state).registries.effectPaddingResolvers;
  let bottom = 0;
  let left = 0;
  let right = 0;
  let top = 0;
  for (let index = 0; index < length; index++) {
    const effect = (list === null ? effects : list[index]) as Readonly<Effect>;
    const entry = resolvers?.get(effect.kind);
    if (entry == null) {
      if (!hasEarlierKind(list, index, effect.kind)) {
        missingKinds?.push(effect.kind);
        emitMiss?.(RenderRegistryTable.EffectPaddingResolver, effect.kind);
      }
      continue;
    }
    const padding = entry(effect);
    bottom += sanitizePadding(padding.bottom);
    left += sanitizePadding(padding.left);
    right += sanitizePadding(padding.right);
    top += sanitizePadding(padding.top);
  }
  out.bottom = bottom;
  out.left = left;
  out.right = right;
  out.top = top;
}

function hasEarlierKind(effects: ReadonlyArray<Readonly<Effect>> | null, end: number, kind: Kind): boolean {
  if (effects === null) return false;
  for (let index = 0; index < end; index++) {
    if (effects[index]!.kind === kind) return true;
  }
  return false;
}

function sanitizePadding(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}
