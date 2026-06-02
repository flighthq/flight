import { setDisplayObjectMaskHooks } from '@flighthq/render';
import { getLocalBoundsRectangle } from '@flighthq/scene';
import type { DisplayObjectMaskHooks, DisplayObjectRenderTreeNode, DOMRenderState, RenderState } from '@flighthq/types';

import { createDOMStageRectangle, type DOMStageRectangle, setDOMClipHooks } from './domClipRect';

export function pushDOMMaskRectangle(rectangles: DOMStageRectangle[], data: DisplayObjectRenderTreeNode): void {
  const bounds = getLocalBoundsRectangle(data.source);
  if (bounds.width <= 0 || bounds.height <= 0) {
    rectangles.push({ bottom: 0, left: 0, right: 0, top: 0 });
    return;
  }

  rectangles.push(createDOMStageRectangle(bounds, data.transform2D));
}

export function enableDOMMaskSupport(state: DOMRenderState): void {
  setDisplayObjectMaskHooks(state, domMaskHooks);
  setDOMClipHooks(state);
}

function popDOMMask(_state: RenderState, _data: DisplayObjectRenderTreeNode, _context?: unknown): void {}

function pushDOMMask(_state: RenderState, data: DisplayObjectRenderTreeNode, context?: unknown): void {
  pushDOMMaskRectangle(context as DOMStageRectangle[], data);
}

const domMaskHooks: DisplayObjectMaskHooks = {
  popMask: popDOMMask,
  pushMask: pushDOMMask,
};
