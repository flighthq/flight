import { enableRenderFeatures, getDisplayObjectRenderNode } from '@flighthq/render';
import type {
  DisplayObject,
  DisplayObjectClipHooks,
  DisplayObjectRenderNode,
  DOMRenderState,
  RenderState,
} from '@flighthq/types';
import { RenderFeatures } from '@flighthq/types';

import { pushDOMClipRectangle, setDOMClipHooks } from './domClipRectangle';
import { pushDOMMaskRectangle } from './domMask';
import type { DOMRenderStateInternal } from './internal';

export function enableDOMClipRectangleSupport(state: DOMRenderState): void {
  state.displayObjectClipHooks = domDisplayObjectClipHooks;
  enableRenderFeatures(state, RenderFeatures.ClipRectangle);
  setDOMClipHooks(state as DOMRenderStateInternal);
}

export function enableDOMMaskSupport(state: DOMRenderState): void {
  state.displayObjectClipHooks = domDisplayObjectClipHooks;
  enableRenderFeatures(state, RenderFeatures.Masks);
  setDOMClipHooks(state as DOMRenderStateInternal);
}

const domDisplayObjectClipHooks: DisplayObjectClipHooks = {
  finalize(state: RenderState): void {
    const internal = state as DOMRenderStateInternal;
    const total = state.currentMaskDepth + state.currentClipRectangleDepth;
    internal.domClipStack.length -= total;
    state.currentMaskDepth = 0;
    state.currentClipRectangleDepth = 0;
  },
  popMask(state: RenderState, data: DisplayObjectRenderNode): void {
    const internal = state as DOMRenderStateInternal;
    while (state.currentMaskDepth > data.maskDepth) {
      internal.domClipStack.length--;
      state.currentMaskDepth--;
    }
  },
  popClipRectangle(state: RenderState, data: DisplayObjectRenderNode): void {
    const internal = state as DOMRenderStateInternal;
    while (state.currentClipRectangleDepth > data.clipRectangleDepth) {
      internal.domClipStack.length--;
      state.currentClipRectangleDepth--;
    }
  },
  pushMask(state: RenderState, source: DisplayObject): void {
    if (source.mask === null) return;
    const maskData = getDisplayObjectRenderNode(state, source.mask);
    if (maskData === undefined) return;
    pushDOMMaskRectangle((state as DOMRenderStateInternal).domClipStack, maskData);
    state.currentMaskDepth++;
  },
  pushClipRectangle(
    state: RenderState,
    data: DisplayObjectRenderNode,
    source: DisplayObject,
    hasChildren: boolean,
  ): void {
    if (!hasChildren || source.clipRectangle === null) return;
    pushDOMClipRectangle((state as DOMRenderStateInternal).domClipStack, source.clipRectangle, data.transform2D);
    state.currentClipRectangleDepth++;
  },
};
