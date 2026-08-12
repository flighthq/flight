import { logOnce } from '@flighthq/log/contract';
import { createSlotTable } from '@flighthq/registry/contract';
import type { RenderState } from '@flighthq/types/contract';
import { LogLevel, RegistryEntryState } from '@flighthq/types/contract';

import { getColorAdjustmentUnsupportedGuard, getRenderStateRuntime } from './renderState';

// Returns whether the color-adjustment deferral guard is installed on `state`.
export function areColorAdjustmentGuardsEnabled(state: RenderState): boolean {
  return getColorAdjustmentUnsupportedGuard(state) != null;
}

// Installs only the shakeable color-adjustment diagnostic on `state`: when enableColorAdjustments is
// also installed and a node's stack contains a non-matrix operation that neither the compact affine
// path nor the full 4×5 path can represent, the resolver reaches this guard through its independent
// optional persistent registry slot and warns once. This does not enable accumulation or backend realization.
// Idempotent.
export function enableColorAdjustmentGuards(state: RenderState): void {
  const runtime = getRenderStateRuntime(state);
  const table =
    runtime.registries.colorAdjustmentUnsupportedGuard ??
    createSlotTable('ColorAdjustmentUnsupportedGuard', 'Disabled');
  if (table.entry?.state !== RegistryEntryState.Bound || table.entry.value !== warnUnsupportedColorAdjustment) {
    runtime.registries.colorAdjustmentUnsupportedGuard = {
      ...table,
      entry: { state: RegistryEntryState.Bound, value: warnUnsupportedColorAdjustment },
    };
  }
}

function warnUnsupportedColorAdjustment(): void {
  logOnce(
    'render:unsupported-color-adjustment',
    LogLevel.Warn,
    {
      message:
        'enableColorAdjustments: a per-object color adjustment is not inline-able because it has no 4×5 matrix representation. Use an Effect pass for the unsupported operation.',
    },
    'render',
  );
}
