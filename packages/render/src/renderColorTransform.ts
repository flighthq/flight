import { getNodeRuntime } from '@flighthq/node';
import type { ColorAdjustmentRuntime, Node, Renderable, RenderProxy, RenderState } from '@flighthq/types';

import { getRenderStateRuntime } from './renderState';

// Hands the node's resolved color transform to the render node. A node's color-adjustment stack
// (NodeRuntime.colorAdjustments) is fused once into the affine `resolvedColorTransform` cache by the
// set-accessors on change — never per frame — so this hot-path visitor is a single field read, identical
// in cost to reading the old `.colorTransform`. Non-inheriting: a node uses its own resolved value (or
// none → null). The value is the Adjustment-tier fold input; it is not a material and does not key the
// batch.
//
// Matrix-tier channel mixing travels through `resolvedColorMatrix`. A non-matrix operation that cannot
// be represented by either path leaves `colorAdjustmentsChannelMixing` set, invoking the shakeable guard
// so unsupported adjustment data is reported rather than silently discarded.
export function updateRenderProxyColorTransform(
  state: RenderState,
  data: RenderProxy,
  _parentData?: RenderProxy,
): void {
  const runtime = getNodeRuntime(data.source as Node) as Readonly<Partial<ColorAdjustmentRuntime>>;
  data.colorTransform = runtime.resolvedColorTransform ?? null;
  data.colorMatrix = runtime.resolvedColorMatrix ?? null;
  if (runtime.colorAdjustmentsChannelMixing) {
    getRenderStateRuntime(state).colorAdjustmentChannelMixingGuard?.(state, data.source as Renderable);
  }
}
