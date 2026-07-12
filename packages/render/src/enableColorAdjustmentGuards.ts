import { logOnce } from '@flighthq/log';
import type { RenderState } from '@flighthq/types';
import { LogLevel } from '@flighthq/types';

import { getRenderStateRuntime } from './renderState';

// Returns whether the color-adjustment deferral guard is installed on `state`.
export function areColorAdjustmentGuardsEnabled(state: RenderState): boolean {
  return getRenderStateRuntime(state).colorAdjustmentChannelMixingGuard != null;
}

// Installs the shakeable color-adjustment guard on `state`: when a node's color-adjustment stack contains
// an off-diagonal channel-mixing adjustment (saturation/hue/sepia/channelMixer) that the affine inline
// fold cannot represent yet, the render walk reaches this guard through its nullable runtime slot and
// warns once (only the affine part of the tint is applied — the non-affine part is skipped, never a
// throw). Not calling this — the production default — costs the render walk nothing, since the message
// and @flighthq/log dependency live only in this separately-imported module. Idempotent.
export function enableColorAdjustmentGuards(state: RenderState): void {
  getRenderStateRuntime(state).colorAdjustmentChannelMixingGuard = warnColorAdjustmentChannelMixingNotInlineable;
}

function warnColorAdjustmentChannelMixingNotInlineable(): void {
  logOnce(
    'render:color-adjustment-channel-mixing-not-inlineable',
    LogLevel.Warn,
    {
      message:
        'updateRenderProxyColorTransform: per-object channel-mixing color adjustment (saturation/hue/sepia/channelMixer) is not inline-able yet — the 4×5 fold is deferred, so only the affine part of the stack was applied. Use an Effect pass for the channel-mixing op.',
    },
    'render',
  );
}
