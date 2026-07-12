import { getNodeRuntime } from '@flighthq/node';
import type { Node, Renderable, RenderProxy, RenderState } from '@flighthq/types';

import { getRenderStateRuntime } from './renderState';

// Hands the node's resolved color transform to the render node. A node's color-adjustment stack
// (NodeRuntime.colorAdjustments) is fused once into the affine `resolvedColorTransform` cache by the
// set-accessors on change — never per frame — so this hot-path visitor is a single field read, identical
// in cost to reading the old `.colorTransform`. Non-inheriting: a node uses its own resolved value (or
// none → null). The value is the Adjustment-tier fold input; it is not a material and does not key the
// batch.
//
// When the fused stack carries off-diagonal channel-mixing terms the 8-float inline fold cannot represent
// yet (the 4×5 path is deferred), the node is flagged `colorAdjustmentsChannelMixing`: only the affine
// part is applied, and the render state's shakeable guard (enableColorAdjustmentGuards) is invoked so the
// deferral is reported rather than silent.
export function updateRenderProxyColorTransform(
  state: RenderState,
  data: RenderProxy,
  _parentData?: RenderProxy,
): void {
  const runtime = getNodeRuntime(data.source as Node);
  data.colorTransform = runtime.resolvedColorTransform ?? null;
  if (runtime.colorAdjustmentsChannelMixing) {
    getRenderStateRuntime(state).colorAdjustmentChannelMixingGuard?.(state, data.source as Renderable);
  }
}
