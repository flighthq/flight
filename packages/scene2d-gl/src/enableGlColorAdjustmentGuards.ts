import { logOnce } from '@flighthq/log/contract';
import { getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import type { GlRenderState } from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';

// Returns whether color-adjustment guards are installed on `state` (enableGlColorAdjustmentGuards).
export function areGlColorAdjustmentGuardsEnabled(state: GlRenderState): boolean {
  return getGlRenderStateRuntime(state).glColorAdjustmentMaterialFeatureGuard != null;
}

// Installs the shakeable color-adjustment guard on `state`: when a node carries a color adjustment but
// registerGlColorAdjustmentMaterialFeature was never called, recordGlSpriteBatchColorScaleBias reaches this guard
// through its nullable runtime slot and warns once (the tint is skipped, drawn untinted — the sentinel
// behavior, never a throw). Not calling this — the production default — costs the batch nothing, since
// the message and @flighthq/log dependency live only in this separately-imported module. Idempotent.
export function enableGlColorAdjustmentGuards(state: GlRenderState): void {
  getGlRenderStateRuntime(state).glColorAdjustmentMaterialFeatureGuard = warnGlColorAdjustmentNotEnabled;
}

function warnGlColorAdjustmentNotEnabled(): void {
  logOnce(
    'scene2d-gl:color-adjustment-not-enabled',
    LogLevel.Warn,
    {
      message:
        'recordGlSpriteBatchColorScaleBias: color adjustment present but GL color adjustment not enabled — call registerGlColorAdjustmentMaterialFeature(state)',
    },
    'scene2d-gl',
  );
}
