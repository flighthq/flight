import { enableRenderFeatures, getDisplayObjectRenderNode } from '@flighthq/render';
import type {
  DisplayObject,
  DisplayObjectClipHooks,
  DisplayObjectRenderNode,
  DOMRenderState,
  RenderState,
} from '@flighthq/types';
import { RenderFeatures } from '@flighthq/types';

import { pushDOMScrollRectangle, setDOMClipHooks } from './domClipRect';
import { pushDOMMaskRectangle } from './domMask';
import type { DOMRenderStateInternal } from './internal';

export function enableDOMMaskSupport(state: DOMRenderState): void {
  state.displayObjectClipHooks = domDisplayObjectClipHooks;
  enableRenderFeatures(state, RenderFeatures.Masks);
  setDOMClipHooks(state as DOMRenderStateInternal);
}

export function enableDOMScrollRectangleSupport(state: DOMRenderState): void {
  state.displayObjectClipHooks = domDisplayObjectClipHooks;
  enableRenderFeatures(state, RenderFeatures.ScrollRectangle);
  setDOMClipHooks(state as DOMRenderStateInternal);
}

const domDisplayObjectClipHooks: DisplayObjectClipHooks = {
  finalize(state: RenderState): void {
    const internal = state as DOMRenderStateInternal;
    const total = state.currentMaskDepth + state.currentScrollRectangleDepth;
    internal.domClipStack.length -= total;
    state.currentMaskDepth = 0;
    state.currentScrollRectangleDepth = 0;
  },
  popMask(state: RenderState, data: DisplayObjectRenderNode): void {
    const internal = state as DOMRenderStateInternal;
    while (state.currentMaskDepth > data.maskDepth) {
      internal.domClipStack.length--;
      state.currentMaskDepth--;
    }
  },
  popScrollRectangle(state: RenderState, data: DisplayObjectRenderNode): void {
    const internal = state as DOMRenderStateInternal;
    while (state.currentScrollRectangleDepth > data.scrollRectangleDepth) {
      internal.domClipStack.length--;
      state.currentScrollRectangleDepth--;
    }
  },
  pushMask(state: RenderState, source: DisplayObject): void {
    if (source.mask === null) return;
    const maskData = getDisplayObjectRenderNode(state, source.mask);
    if (maskData === undefined) return;
    pushDOMMaskRectangle((state as DOMRenderStateInternal).domClipStack, maskData);
    state.currentMaskDepth++;
  },
  pushScrollRectangle(
    state: RenderState,
    data: DisplayObjectRenderNode,
    source: DisplayObject,
    hasChildren: boolean,
  ): void {
    if (!hasChildren || source.scrollRectangle === null) return;
    pushDOMScrollRectangle((state as DOMRenderStateInternal).domClipStack, data);
    state.currentScrollRectangleDepth++;
  },
};
