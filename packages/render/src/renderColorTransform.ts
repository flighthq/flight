import type { HasColorTransform, RenderProxy, RenderState } from '@flighthq/types';

// Resolves a node's node-level color transform (the HasColorTransform trait) onto the render node.
// Non-inheriting: a node uses its own color transform (or none → null). Called for every node in the
// 2D render walk. This is the Adjustment-tier fold — the value is not a material and does not key the
// batch; the backend folds it into the draw (a whole-batch uniform, or per-instance when tints vary).
export function updateRenderProxyColorTransform(
  state: RenderState,
  data: RenderProxy,
  _parentData?: RenderProxy,
): void {
  const source = data.source as Partial<HasColorTransform>;
  data.colorTransform = source.colorTransform ?? null;
}
