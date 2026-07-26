import { logOnce } from '@flighthq/log';
import type { RenderState } from '@flighthq/types';
import { LogLevel } from '@flighthq/types';

import { getRenderStateRuntime } from './renderState';

// Returns whether the color-adjustment deferral guard is installed on `state`.
export function areColorAdjustmentGuardsEnabled(state: RenderState): boolean {
  return getRenderStateRuntime(state).colorAdjustmentChannelMixingGuard != null;
}

// Installs the shakeable color-adjustment guard on `state`: when a node's stack contains a non-matrix
// operation that neither the compact affine path nor the full 4×5 path can represent, the render walk
// reaches this guard through its nullable runtime slot and warns once. Not calling this — the production
// default — costs the render walk nothing, since the message and @flighthq/log dependency live only in
// this separately-imported module. Idempotent.
export function enableColorAdjustmentGuards(state: RenderState): void {
  getRenderStateRuntime(state).colorAdjustmentChannelMixingGuard = warnColorAdjustmentChannelMixingNotInlineable;
}

function warnColorAdjustmentChannelMixingNotInlineable(): void {
  logOnce(
    'render:color-adjustment-channel-mixing-not-inlineable',
    LogLevel.Warn,
    {
      message:
        'updateRenderProxyColorTransform: a per-object color adjustment is not inline-able because it has no 4×5 matrix representation. Use an Effect pass for the unsupported operation.',
    },
    'render',
  );
}
