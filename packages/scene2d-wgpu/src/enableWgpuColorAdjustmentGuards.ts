import { logOnce } from '@flighthq/log/contract';
import { createSlotTable } from '@flighthq/registry/contract';
import { getWgpuColorAdjustmentMaterialFeatureGuard, getWgpuRenderStateRuntime } from '@flighthq/render-wgpu/contract';
import type { WgpuRenderState } from '@flighthq/types/contract';
import { LogLevel, RegistryEntryState } from '@flighthq/types/contract';

// Returns whether color-adjustment guards are installed on `state` (enableWgpuColorAdjustmentGuards).
export function areWgpuColorAdjustmentGuardsEnabled(state: WgpuRenderState): boolean {
  return getWgpuColorAdjustmentMaterialFeatureGuard(state) != null;
}

// Installs the shakeable color-adjustment guard on `state`: when a node carries a color adjustment but
// registerWgpuColorAdjustmentMaterialFeature was never called, recordWgpuQuadBatchColorScaleBias reaches this guard
// through its optional persistent registry slot and warns once (the tint is skipped, drawn untinted — the sentinel
// behavior, never a throw). Not calling this — the production default — costs the batch nothing, since
// the message and @flighthq/log dependency live only in this separately-imported module. Idempotent.
export function enableWgpuColorAdjustmentGuards(state: WgpuRenderState): void {
  const runtime = getWgpuRenderStateRuntime(state);
  const table =
    runtime.registries.colorAdjustmentFeatureGuard ?? createSlotTable('WgpuColorAdjustmentFeatureGuard', 'Disabled');
  if (table.entry?.state !== RegistryEntryState.Bound || table.entry.value !== warnWgpuColorAdjustmentNotEnabled) {
    runtime.registries.colorAdjustmentFeatureGuard = {
      ...table,
      entry: { state: RegistryEntryState.Bound, value: warnWgpuColorAdjustmentNotEnabled },
    };
  }
}

function warnWgpuColorAdjustmentNotEnabled(): void {
  logOnce(
    'scene2d-wgpu:color-adjustment-not-enabled',
    LogLevel.Warn,
    {
      message:
        'recordWgpuQuadBatchColorScaleBias: color adjustment present but WGPU color adjustment not enabled — call registerWgpuColorAdjustmentMaterialFeature(state)',
    },
    'scene2d-wgpu',
  );
}
