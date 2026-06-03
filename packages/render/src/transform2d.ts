import { copyMatrix, multiplyMatrix, translateMatrixByVectorXY } from '@flighthq/geometry';
import { getLocalTransformMatrix, getLocalTransformRevision } from '@flighthq/scene';
import type {
  DisplayObjectRenderNode,
  HasTransform2D,
  RenderState,
  RenderNode2D,
  SceneNode,
} from '@flighthq/types';
import { RenderFeatures } from '@flighthq/types';

import { hasRenderFeatures } from './renderer';

export function updateDisplayObjectRenderTransform(
  state: RenderState,
  data: DisplayObjectRenderNode,
  parentData?: DisplayObjectRenderNode,
): boolean {
  if (data.resolver !== null) return false;

  const owner = data.owner;
  const scrollRectangle = owner.scrollRectangle;
  if (hasRenderFeatures(state, RenderFeatures.ScrollRectangle) && scrollRectangle !== null) {
    // scrollRectangle shifts the render transform by (-x, -y) so that content at (x, y) in local
    // space lands at the object's world position on screen. Renderers then clip to (x, y, w, h)
    // in shifted local space and draw source crops at the same (x, y) offset — both of which
    // map back to the object's origin in screen space. scrollRectangle is not tracked by
    // localTransformID, so always recalculate when it is set.
    recalculateRenderTransform2D(state, data, parentData);
    data.lastLocalTransformID = getLocalTransformRevision(data.owner as SceneNode);
    translateMatrixByVectorXY(data.transform2D, data.transform2D, -scrollRectangle.x, -scrollRectangle.y);
    return true;
  }
  return updateRenderNode2DTransform(state, data, parentData);
}

export function updateRenderNode2DTransform(
  state: RenderState,
  data: RenderNode2D,
  parentData?: RenderNode2D,
): boolean {
  if (data.resolver !== null) return false;

  const localTransformID = getLocalTransformRevision(data.owner as SceneNode);
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
  const transform2D = getLocalTransformMatrix(data.owner as SceneNode & HasTransform2D);
  const parentTransform2D = parentData !== undefined ? parentData.transform2D : state.renderTransform2D;
  if (parentTransform2D !== null) {
    multiplyMatrix(data.transform2D, parentTransform2D, transform2D);
  } else {
    copyMatrix(data.transform2D, transform2D);
  }
  data.transformFrameID = state.currentFrameID;
}
