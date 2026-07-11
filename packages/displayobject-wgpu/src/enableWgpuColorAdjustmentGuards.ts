import { logOnce } from '@flighthq/log';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu';
import type { WgpuRenderState } from '@flighthq/types';
import { LogLevel } from '@flighthq/types';

// Returns whether color-adjustment guards are installed on `state` (enableWgpuColorAdjustmentGuards).
export function areWgpuColorAdjustmentGuardsEnabled(state: WgpuRenderState): boolean {
  return getWgpuRenderStateRuntime(state).wgpuColorAdjustmentGuard != null;
}

// Installs the shakeable color-adjustment guard on `state`: when a node carries a color transform but
// enableWgpuColorAdjustment was never called, recordWgpuSpriteBatchColorTransform reaches this guard
// through its nullable runtime slot and warns once (the tint is skipped, drawn untinted — the sentinel
// behavior, never a throw). Not calling this — the production default — costs the batch nothing, since
// the message and @flighthq/log dependency live only in this separately-imported module. Idempotent.
export function enableWgpuColorAdjustmentGuards(state: WgpuRenderState): void {
  getWgpuRenderStateRuntime(state).wgpuColorAdjustmentGuard = warnWgpuColorAdjustmentNotEnabled;
}

function warnWgpuColorAdjustmentNotEnabled(): void {
  logOnce(
    'displayobject-wgpu:color-adjustment-not-enabled',
    LogLevel.Warn,
    {
      message:
        'recordWgpuSpriteBatchColorTransform: color transform present but WGPU color adjustment not enabled — call enableWgpuColorAdjustment(state)',
    },
    'displayobject-wgpu',
  );
}
