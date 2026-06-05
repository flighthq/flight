import { enableRenderFeatures, setDisplayObjectMaskHooks } from '@flighthq/render';
import { getLocalBoundsRectangle } from '@flighthq/scene';
import type {
  DisplayObject,
  DisplayObjectMaskHooks,
  DisplayObjectRenderNode,
  DOMRenderState,
  RenderState,
} from '@flighthq/types';
import { RenderFeatures } from '@flighthq/types';

import { createDOMStageRectangle, type DOMStageRectangle, setDOMClipHooks } from './domClipRect';
import type { DOMRenderStateInternal } from './internal';

export function enableDOMMaskSupport(state: DOMRenderState): void {
  enableRenderFeatures(state, RenderFeatures.Masks);
  setDisplayObjectMaskHooks(state, domMaskHooks);
  setDOMClipHooks(state);
}

export function pushDOMMaskRectangle(rectangles: DOMStageRectangle[], data: DisplayObjectRenderNode): void {
  const bounds = getLocalBoundsRectangle(data.source as DisplayObject);
  if (bounds.width <= 0 || bounds.height <= 0) {
    rectangles.push({ bottom: 0, left: 0, right: 0, top: 0 });
    return;
  }

  rectangles.push(createDOMStageRectangle(bounds, data.transform2D));
}

function popDOMMask(state: RenderState): void {
  (state as DOMRenderStateInternal).domClipStack.length--;
}

function pushDOMMask(state: RenderState, data: DisplayObjectRenderNode): void {
  pushDOMMaskRectangle((state as DOMRenderStateInternal).domClipStack, data);
}

const domMaskHooks: DisplayObjectMaskHooks = {
  popMask: popDOMMask,
  pushMask: pushDOMMask,
};
