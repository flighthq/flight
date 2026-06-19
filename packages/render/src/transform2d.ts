import { copyMatrix, multiplyMatrix } from '@flighthq/geometry';
import { getNodeLocalTransformMatrix, getNodeLocalTransformRevision } from '@flighthq/node';
import type { HasTransform2D, Node, RenderProxy2D, RenderState } from '@flighthq/types';

import { getRenderStateRuntime } from './renderState';

export function updateDisplayObjectRenderTransform(
  state: RenderState,
  data: RenderProxy2D,
  parentData?: RenderProxy2D,
): boolean {
  return updateRenderProxy2DTransform(state, data, parentData);
}

export function updateRenderProxy2DTransform(
  state: RenderState,
  data: RenderProxy2D,
  parentData?: RenderProxy2D,
): boolean {
  const localTransformID = getNodeLocalTransformRevision(data.source as Node);
  const parentDirty =
    parentData !== undefined && parentData.transformFrameID === getRenderStateRuntime(state).currentFrameID;
  const localDirty = data.lastLocalTransformID !== localTransformID;

  if (parentDirty || localDirty) {
    recalculateRenderTransform2D(state, data, parentData);
    data.lastLocalTransformID = localTransformID;
    return true;
  }
  return false;
}

function recalculateRenderTransform2D(state: RenderState, data: RenderProxy2D, parentData?: RenderProxy2D): void {
  const transform2D = getNodeLocalTransformMatrix(data.source as Node & HasTransform2D);
  const parentTransform2D = parentData !== undefined ? parentData.transform2D : state.renderTransform2D;
  if (parentTransform2D !== null) {
    multiplyMatrix(data.transform2D, parentTransform2D, transform2D);
  } else {
    copyMatrix(data.transform2D, transform2D);
  }
  data.transformFrameID = getRenderStateRuntime(state).currentFrameID;
}
