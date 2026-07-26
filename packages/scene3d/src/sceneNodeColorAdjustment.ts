import {
  COLOR_ADJUSTMENT_CHANNEL_MIXING,
  COLOR_ADJUSTMENT_NONE,
  createTintAdjustment,
  resolveColorAdjustmentsColorMatrix,
  resolveColorAdjustmentsColorTransform,
} from '@flighthq/adjustments';
import { createColorTransform } from '@flighthq/materials';
import { invalidateNodeAppearance } from '@flighthq/node';
import type { Adjustment, Node3D, Node3DRuntime } from '@flighthq/types';

import { getNode3DRuntime } from './sceneNode';

export function addNode3DColorAdjustment(source: Node3D, adjustment: Adjustment): void {
  const runtime = getNode3DRuntime(source);
  const current = runtime.colorAdjustments;
  runtime.colorAdjustments = current === null ? [adjustment] : [...current, adjustment];
  resolveNode3DColorAdjustments(runtime);
  invalidateNodeAppearance(source);
}

export function getNode3DColorAdjustments(source: Readonly<Node3D>): readonly Adjustment[] | null {
  return getNode3DRuntime(source).colorAdjustments;
}

export function setNode3DColorAdjustments(source: Node3D, value: readonly Adjustment[] | null): void {
  const runtime = getNode3DRuntime(source);
  runtime.colorAdjustments = value;
  resolveNode3DColorAdjustments(runtime);
  invalidateNodeAppearance(source);
}

export function setNode3DColorAdjustmentTint(source: Node3D, tint: number): void {
  setNode3DColorAdjustments(source, [createTintAdjustment(tint)]);
}

function resolveNode3DColorAdjustments(runtime: Node3DRuntime): void {
  const adjustments = runtime.colorAdjustments;
  if (adjustments === null || adjustments.length === 0) {
    runtime.resolvedColorTransform = null;
    runtime.resolvedColorMatrix = null;
    runtime.colorAdjustmentsChannelMixing = false;
    return;
  }
  const out = runtime.resolvedColorTransform ?? createColorTransform();
  const status = resolveColorAdjustmentsColorTransform(adjustments, out);
  if (status === COLOR_ADJUSTMENT_NONE) {
    runtime.resolvedColorTransform = null;
    runtime.resolvedColorMatrix = null;
    runtime.colorAdjustmentsChannelMixing = false;
    return;
  }
  runtime.resolvedColorTransform = out;
  runtime.resolvedColorMatrix =
    status === COLOR_ADJUSTMENT_CHANNEL_MIXING ? resolveColorAdjustmentsColorMatrix(adjustments) : null;
  runtime.colorAdjustmentsChannelMixing =
    status === COLOR_ADJUSTMENT_CHANNEL_MIXING && runtime.resolvedColorMatrix === null;
}
