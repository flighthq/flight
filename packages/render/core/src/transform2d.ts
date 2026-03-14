import { matrix3x2 } from '@flighthq/geometry';
import { getLocalTransform2D, getLocalTransformID } from '@flighthq/scene-graph-core';
import type { DisplayObjectRenderNode, GraphNode, HasTransform2D, RenderNode2D, RenderState } from '@flighthq/types';

export function updateDisplayObjectRenderTransform2D(
  state: RenderState,
  data: DisplayObjectRenderNode,
  parentData?: DisplayObjectRenderNode,
): boolean {
  const updated = updateRenderTransform2D(state, data, parentData);
  const source = data.source;
  if (updated && source.scrollRect !== null) {
    const scrollRect = source.scrollRect;
    matrix3x2.translateUsingVectorXY(data.transform2D, data.transform2D, -scrollRect.x, -scrollRect.y);
  }
  return updated;
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
    matrix3x2.concat(data.transform2D, parentTransform2D, transform2D);
  } else {
    matrix3x2.copy(data.transform2D, transform2D);
  }
  data.transformFrameID = state.currentFrameID;
}
