import { matrix3x2 } from '@flighthq/geometry';
import { getLocalTransform, getLocalTransformID } from '@flighthq/scene-graph-display';
import type { RenderNode, RenderState } from '@flighthq/types';

export function updateRenderTransform(state: RenderState, data: RenderNode, parentData?: RenderNode): boolean {
  const localTransformID = getLocalTransformID(data.source);
  if (
    (parentData !== undefined && parentData.transformFrameID === state.currentFrameID) ||
    data.lastLocalTransformID !== localTransformID
  ) {
    recalculateRenderTransform(state, data, parentData);
    data.lastLocalTransformID = localTransformID;
    return true;
  }
  return false;
}

function recalculateRenderTransform(state: RenderState, data: RenderNode, parentData?: RenderNode): void {
  const source = data.source;
  const transform = getLocalTransform(source);
  const parentTransform = parentData !== undefined ? parentData.transform : state.renderTransform;

  if (parentTransform !== null) {
    matrix3x2.concat(data.transform, transform, parentTransform);
  } else {
    matrix3x2.copy(data.transform, transform);
  }

  if (source.scrollRect !== null) {
    const scrollRect = source.scrollRect;
    matrix3x2.translateUsingVectorXY(data.transform, data.transform, -scrollRect.x, -scrollRect.y);
  }

  data.transformFrameID = state.currentFrameID;
}
