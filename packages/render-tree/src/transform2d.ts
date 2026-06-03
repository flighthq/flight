import { copyMatrix, multiplyMatrix, translateMatrixByVectorXY } from '@flighthq/geometry';
import { hasRenderFeatures } from '@flighthq/render';
import { getLocalTransformMatrix, getLocalTransformRevision } from '@flighthq/scene';
import type {
  DisplayObjectRenderTreeNode,
  HasTransform2D,
  RenderState,
  RenderTreeNode2D,
  SceneNode,
} from '@flighthq/types';
import { RenderFeatures } from '@flighthq/types';

export function updateDisplayObjectRenderTransform(
  state: RenderState,
  data: DisplayObjectRenderTreeNode,
  parentData?: DisplayObjectRenderTreeNode,
): boolean {
  const source = data.source;
  const scrollRectangle = source.scrollRectangle;
  if (hasRenderFeatures(state, RenderFeatures.ScrollRectangle) && scrollRectangle !== null) {
    // scrollRectangle shifts the render transform by (-x, -y) so that content at (x, y) in local
    // space lands at the object's world position on screen. Renderers then clip to (x, y, w, h)
    // in shifted local space and draw source crops at the same (x, y) offset — both of which
    // map back to the object's origin in screen space. scrollRectangle is not tracked by
    // localTransformID, so always recalculate when it is set.
    recalculateRenderTransform2D(state, data, parentData);
    data.lastLocalTransformID = getLocalTransformRevision(data.source as SceneNode);
    translateMatrixByVectorXY(data.transform2D, data.transform2D, -scrollRectangle.x, -scrollRectangle.y);
    applyPresentationTransform2D(data);
    return true;
  }
  return updateRenderNode2DTransform(state, data, parentData);
}

export function updateRenderNode2DTransform(
  state: RenderState,
  data: RenderTreeNode2D,
  parentData?: RenderTreeNode2D,
): boolean {
  const localTransformID = getLocalTransformRevision(data.source as SceneNode);
  if (
    (parentData !== undefined && parentData.transformFrameID === state.currentFrameID) ||
    data.lastLocalTransformID !== localTransformID
  ) {
    recalculateRenderTransform2D(state, data, parentData);
    applyPresentationTransform2D(data);
    data.lastLocalTransformID = localTransformID;
    return true;
  }
  return false;
}

function recalculateRenderTransform2D(state: RenderState, data: RenderTreeNode2D, parentData?: RenderTreeNode2D): void {
  const source = data.source;
  const transform2D = getLocalTransformMatrix(source as SceneNode & HasTransform2D);
  const parentTransform2D = parentData !== undefined ? parentData.transform2D : state.renderTransform2D;
  if (parentTransform2D !== null) {
    multiplyMatrix(data.transform2D, parentTransform2D, transform2D);
  } else {
    copyMatrix(data.transform2D, transform2D);
  }
  data.transformFrameID = state.currentFrameID;
}

function applyPresentationTransform2D(data: RenderTreeNode2D): void {
  if (data.presentationTransform2D !== null) {
    multiplyMatrix(data.transform2D, data.transform2D, data.presentationTransform2D);
  }
}
