import { logOnce } from '@flighthq/log/contract';
import { createSlotTable } from '@flighthq/registry/contract';
import { getGlColorAdjustmentMaterialFeatureGuard, getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import type { GlRenderState } from '@flighthq/types/contract';
import { LogLevel, RegistryEntryState } from '@flighthq/types/contract';

// Returns whether color-adjustment guards are installed on `state` (enableGlColorAdjustmentGuards).
export function areGlColorAdjustmentGuardsEnabled(state: GlRenderState): boolean {
  return getGlColorAdjustmentMaterialFeatureGuard(state) != null;
}

// Installs the shakeable color-adjustment guard on `state`: when a node carries a color adjustment but
// registerGlColorAdjustmentMaterialFeature was never called, recordGlQuadBatchColorScaleBias reaches this guard
// through its optional persistent registry slot and warns once (the tint is skipped, drawn untinted — the sentinel
// behavior, never a throw). Not calling this — the production default — costs the batch nothing, since
// the message and @flighthq/log dependency live only in this separately-imported module. Idempotent.
export function enableGlColorAdjustmentGuards(state: GlRenderState): void {
  const runtime = getGlRenderStateRuntime(state);
  const table =
    runtime.registries.colorAdjustmentFeatureGuard ?? createSlotTable('GlColorAdjustmentFeatureGuard', 'Disabled');
  if (table.entry?.state !== RegistryEntryState.Bound || table.entry.value !== warnGlColorAdjustmentNotEnabled) {
    runtime.registries.colorAdjustmentFeatureGuard = {
      ...table,
      entry: { state: RegistryEntryState.Bound, value: warnGlColorAdjustmentNotEnabled },
    };
  }
}

function warnGlColorAdjustmentNotEnabled(): void {
  logOnce(
    'scene2d-gl:color-adjustment-not-enabled',
    LogLevel.Warn,
    {
      message:
        'recordGlQuadBatchColorScaleBias: color adjustment present but GL color adjustment not enabled — call registerGlColorAdjustmentMaterialFeature(state)',
    },
    'scene2d-gl',
  );
}
