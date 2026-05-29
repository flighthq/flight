import { concatMatrix, copyMatrix, translateMatrixByVectorXY } from '@flighthq/geometry';
import { getLocalTransform2D, getLocalTransformID } from '@flighthq/scenegraph-core';
import type { DisplayObjectRenderNode, GraphNode, HasTransform2D, RenderNode2D, RenderState } from '@flighthq/types';

export function updateDisplayObjectRenderTransform2D(
  state: RenderState,
  data: DisplayObjectRenderNode,
  parentData?: DisplayObjectRenderNode,
): boolean {
  const source = data.source;
  const scrollRect = source.scrollRect;
  if (scrollRect !== null) {
    // scrollRect contributes to the render transform but isn't tracked by localTransformID,
    // so always recalculate when it is set.
    recalculateRenderTransform2D(state, data, parentData);
    data.lastLocalTransformID = getLocalTransformID(data.source as GraphNode);
    translateMatrixByVectorXY(data.transform2D, data.transform2D, -scrollRect.x, -scrollRect.y);
    return true;
  }
  return updateRenderTransform2D(state, data, parentData);
}

export function updateRenderTransform2D(state: RenderState, data: RenderNode2D, parentData?: RenderNode2D): boolean {
  const localTransformID = getLocalTransformID(data.source as GraphNode);
  if (
    (parentData !== undefined && parentData.transformFrameID === state.currentFrameID) ||
    data.lastLocalTransformID !== localTransformID
  ) {
    recalculateRenderTransform2D(state, data, parentData);
    data.lastLocalTransformID = localTransformID;
    return true;
  }
  return false;
}

function recalculateRenderTransform2D(state: RenderState, data: RenderNode2D, parentData?: RenderNode2D): void {
  const source = data.source;
  const transform2D = getLocalTransform2D(source as GraphNode & HasTransform2D);
  const parentTransform2D = parentData !== undefined ? parentData.transform2D : state.renderTransform2D;
  if (parentTransform2D !== null) {
    concatMatrix(data.transform2D, transform2D, parentTransform2D);
  } else {
    copyMatrix(data.transform2D, transform2D);
  }
  data.transformFrameID = state.currentFrameID;
}
