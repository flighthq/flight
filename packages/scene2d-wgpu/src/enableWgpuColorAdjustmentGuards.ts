import type { LogState } from '@flighthq/log/contract';
import { logOnce } from '@flighthq/log/contract';
import { getWgpuColorAdjustmentMaterialFeatureGuard, getWgpuRenderStateRuntime } from '@flighthq/render-wgpu/contract';
import type { WgpuRenderState } from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';

// Returns whether color-adjustment guards are installed on `state` (enableWgpuColorAdjustmentGuards).
export function areWgpuColorAdjustmentGuardsEnabled(state: WgpuRenderState): boolean {
  return getWgpuColorAdjustmentMaterialFeatureGuard(state) != null;
}

// Installs the shakeable color-adjustment guard on `state`: when a node carries a color adjustment but
// registerWgpuColorAdjustmentMaterialFeature was never called, recordWgpuQuadBatchColorScaleBias reaches this guard
// through its optional persistent registry slot and warns once into `logState` (the tint is skipped, drawn
// untinted — the sentinel behavior, never a throw). A null `logState` keeps the one recorded by an earlier call;
// with none recorded the guard stays silent. Not calling this — the production default — costs the batch
// nothing, since the message and @flighthq/log dependency live only in this separately-imported module.
// Idempotent: the installed guard is the same function on every call.
export function enableWgpuColorAdjustmentGuards(state: WgpuRenderState, logState: LogState | null): void {
  let slot = _guardSlots.get(state);
  if (slot === undefined) {
    const created: GuardSlot = { guard: () => warnWgpuColorAdjustmentNotEnabled(created.logState), logState: null };
    slot = created;
    _guardSlots.set(state, slot);
  }
  if (logState !== null) slot.logState = logState;
  const runtime = getWgpuRenderStateRuntime(state);
  if (runtime.registries.colorAdjustmentFeatureGuard !== slot.guard) {
    runtime.registries.colorAdjustmentFeatureGuard = slot.guard;
  }
}

interface GuardSlot {
  readonly guard: () => void;
  logState: LogState | null;
}

// The installed guard and its log state, per render state, so re-enabling keeps one guard identity.
const _guardSlots = new WeakMap<WgpuRenderState, GuardSlot>();

function warnWgpuColorAdjustmentNotEnabled(logState: LogState | null): void {
  if (logState === null) return;
  logOnce(
    logState,
    0,
    'scene2d-wgpu:color-adjustment-not-enabled',
    LogLevel.Warn,
    {
      message:
        'recordWgpuQuadBatchColorScaleBias: color adjustment present but WGPU color adjustment not enabled — call registerWgpuColorAdjustmentMaterialFeature(state)',
    },
    'scene2d-wgpu',
  );
}
