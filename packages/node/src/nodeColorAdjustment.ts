import {
  COLOR_ADJUSTMENT_CHANNEL_MIXING,
  createTintAdjustment,
  resolveColorAdjustmentsColorMatrix,
  resolveColorAdjustmentsColorScaleBias,
} from '@flighthq/adjustments/contract';
import { createColorScaleBias } from '@flighthq/materials/contract';
import type { Adjustment, ColorAdjustmentRuntime, Node, NodeRuntime } from '@flighthq/types/contract';

import { getNodeRuntime } from './node';
import { invalidateNodeAppearance } from './revision';

/**
 * Appends one pointwise adjustment without replacing the existing stack.
 *
 * For explicit per-channel scale/bias authoring, use
 * `createColorScaleBiasAdjustment` from `@flighthq/adjustments`.
 */
export function addNodeColorAdjustment<Traits extends object>(source: Node<Traits>, adjustment: Adjustment): void {
  const runtime = getNodeRuntime(source) as NodeRuntime<Traits>;
  const current = runtime.colorAdjustments;
  runtime.colorAdjustments = current === null ? [adjustment] : [...current, adjustment];
  resolveNodeColorAdjustments(runtime);
  invalidateNodeAppearance(source);
}

/** Returns the complete authored adjustment stack, or null for the untinted default. */
export function getNodeColorAdjustments<Traits extends object>(
  source: Readonly<Node<Traits>>,
): readonly Adjustment[] | null {
  return getNodeRuntime(source).colorAdjustments;
}

/**
 * Replaces the complete pointwise adjustment stack; null clears it.
 *
 * Tint's golden path is `setNodeColorAdjustmentsTint`. Use `createColorScaleBiasAdjustment` for
 * explicit per-channel `out = in * scale + bias` values with normalized-linear bias.
 */
export function setNodeColorAdjustments<Traits extends object>(
  source: Node<Traits>,
  value: readonly Adjustment[] | null,
): void {
  const runtime = getNodeRuntime(source) as NodeRuntime<Traits>;
  runtime.colorAdjustments = value;
  resolveNodeColorAdjustments(runtime);
  invalidateNodeAppearance(source);
}

/** Replaces the complete stack with one packed-RGBA tint adjustment. */
export function setNodeColorAdjustmentsTint<Traits extends object>(source: Node<Traits>, tint: number): void {
  setNodeColorAdjustments(source, [createTintAdjustment(tint)]);
}

function resolveNodeColorAdjustments(runtime: ColorAdjustmentRuntime): void {
  const adjustments = runtime.colorAdjustments;
  if (adjustments === null || adjustments.length === 0) {
    runtime.resolvedColorScaleBias = null;
    runtime.resolvedColorMatrix = null;
    runtime.colorAdjustmentsUnsupported = false;
    return;
  }
  const out = runtime.resolvedColorScaleBias ?? createColorScaleBias();
  const status = resolveColorAdjustmentsColorScaleBias(adjustments, out);
  runtime.resolvedColorScaleBias = out;
  runtime.resolvedColorMatrix =
    status === COLOR_ADJUSTMENT_CHANNEL_MIXING ? resolveColorAdjustmentsColorMatrix(adjustments) : null;
  runtime.colorAdjustmentsUnsupported =
    status === COLOR_ADJUSTMENT_CHANNEL_MIXING && runtime.resolvedColorMatrix === null;
}
