import { copyMatrix, multiplyMatrix } from '@flighthq/geometry/contract';
import { getNodeLocalMatrix, getNodeLocalTransformRevision } from '@flighthq/node/contract';
import type { HasTransform2D, Node, RenderProxy2D, RenderState } from '@flighthq/types/contract';

import { getRenderStateRuntime } from './renderState';

export function updateRenderProxy2DTransform(
  state: RenderState,
  data: RenderProxy2D,
  parentData?: RenderProxy2D,
): boolean {
  const localTransformId = getNodeLocalTransformRevision(data.source as Node);
  const parentDirty =
    parentData !== undefined && parentData.transformFrameId === getRenderStateRuntime(state).currentFrameId;
  // The refresh policy deliberately re-reads every live transform each walk. That includes the
  // root transform supplied by the render state: offscreen captures can change their projection
  // while the source node's local transform revision remains unchanged.
  const localDirty =
    state.sceneGraphSyncPolicy === 'refreshDerivedState' || data.lastLocalTransformId !== localTransformId;

  if (parentDirty || localDirty) {
    recalculateRenderTransform2D(state, data, parentData);
    data.lastLocalTransformId = localTransformId;
    return true;
  }
  return false;
}

function recalculateRenderTransform2D(state: RenderState, data: RenderProxy2D, parentData?: RenderProxy2D): void {
  const transform2D = getNodeLocalMatrix(data.source as Node & HasTransform2D);
  const parentTransform2D = parentData !== undefined ? parentData.transform2D : state.renderTransform2D;
  if (parentTransform2D !== null) {
    multiplyMatrix(data.transform2D, parentTransform2D, transform2D);
  } else {
    copyMatrix(data.transform2D, transform2D);
  }
  data.transformFrameId = getRenderStateRuntime(state).currentFrameId;
}
