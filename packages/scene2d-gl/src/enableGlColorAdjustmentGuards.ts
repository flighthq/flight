import { logOnce } from '@flighthq/log/contract';
import type { LogState } from '@flighthq/log/contract';
import { getGlColorAdjustmentMaterialFeatureGuard, getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import type { GlRenderState } from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';

// Returns whether color-adjustment guards are installed on `state` (enableGlColorAdjustmentGuards).
export function areGlColorAdjustmentGuardsEnabled(state: GlRenderState): boolean {
  return getGlColorAdjustmentMaterialFeatureGuard(state) != null;
}

// Installs the shakeable color-adjustment guard on `state`: when a node carries a color adjustment but
// registerGlColorAdjustmentMaterialFeature was never called, recordGlQuadBatchColorScaleBias reaches this guard
// through its optional persistent registry slot and warns once (the tint is skipped, drawn untinted — the sentinel
// behavior, never a throw). Not calling this — the production default — costs the batch nothing, since
// the message and @flighthq/log dependency live only in this separately-imported module. Idempotent.
export function enableGlColorAdjustmentGuards(state: GlRenderState, logState: LogState | null): void {
  const registries = getGlRenderStateRuntime(state).registries;
  const installed = _installedGuards.get(state);
  if (
    installed !== undefined &&
    installed.logState === logState &&
    registries.colorAdjustmentFeatureGuard === installed.guard
  )
    return;
  const guard = (): void => warnGlColorAdjustmentNotEnabled(logState);
  _installedGuards.set(state, { guard, logState });
  registries.colorAdjustmentFeatureGuard = guard;
}

function warnGlColorAdjustmentNotEnabled(logState: LogState | null): void {
  if (logState === null) return;
  // The render guards take no clock, so the warning is stamped at time zero.
  logOnce(
    logState,
    0,
    'scene2d-gl:color-adjustment-not-enabled',
    LogLevel.Warn,
    {
      message:
        'recordGlQuadBatchColorScaleBias: color adjustment present but GL color adjustment not enabled — call registerGlColorAdjustmentMaterialFeature(state)',
    },
    'scene2d-gl',
  );
}

// The guard installed per render state and the log state it reports to, so enabling again with the same
// log state keeps the installed guard.
const _installedGuards = new WeakMap<GlRenderState, { guard: () => void; logState: LogState | null }>();
