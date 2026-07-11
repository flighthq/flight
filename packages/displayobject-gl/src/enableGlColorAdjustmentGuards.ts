import { logOnce } from '@flighthq/log';
import { getGlRenderStateRuntime } from '@flighthq/render-gl';
import type { GlRenderState } from '@flighthq/types';
import { LogLevel } from '@flighthq/types';

// Returns whether color-adjustment guards are installed on `state` (enableGlColorAdjustmentGuards).
export function areGlColorAdjustmentGuardsEnabled(state: GlRenderState): boolean {
  return getGlRenderStateRuntime(state).glColorAdjustmentGuard != null;
}

// Installs the shakeable color-adjustment guard on `state`: when a node carries a color transform but
// enableGlColorAdjustment was never called, recordGlSpriteBatchColorTransform reaches this guard
// through its nullable runtime slot and warns once (the tint is skipped, drawn untinted — the sentinel
// behavior, never a throw). Not calling this — the production default — costs the batch nothing, since
// the message and @flighthq/log dependency live only in this separately-imported module. Idempotent.
export function enableGlColorAdjustmentGuards(state: GlRenderState): void {
  getGlRenderStateRuntime(state).glColorAdjustmentGuard = warnGlColorAdjustmentNotEnabled;
}

function warnGlColorAdjustmentNotEnabled(): void {
  logOnce(
    'displayobject-gl:color-adjustment-not-enabled',
    LogLevel.Warn,
    {
      message:
        'recordGlSpriteBatchColorTransform: color transform present but GL color adjustment not enabled — call enableGlColorAdjustment(state)',
    },
    'displayobject-gl',
  );
}
