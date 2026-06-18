import { enableDisplayObjectMaskPass, getRenderProxy2D } from '@flighthq/render';
import type {
  DisplayObject,
  DisplayObjectClipHooks,
  DOMRenderState,
  RenderProxy2D,
  RenderState,
} from '@flighthq/types';

import { pushDOMClipRectangle, setDOMClipHooks } from './domClipRectangle';
import { pushDOMMaskRectangle } from './domMask';
import type { DOMRenderStateInternal } from './internal';

export function enableDOMClipRectangleSupport(state: DOMRenderState): void {
  state.displayObjectClipHooks = domDisplayObjectClipHooks;
  setDOMClipHooks(state as DOMRenderStateInternal);
}

export function enableDOMMaskSupport(state: DOMRenderState): void {
  state.displayObjectClipHooks = domDisplayObjectClipHooks;
  enableDisplayObjectMaskPass(state);
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
  popMask(state: RenderState, data: RenderProxy2D): void {
    const internal = state as DOMRenderStateInternal;
    while (state.currentMaskDepth > data.maskDepth) {
      internal.domClipStack.length--;
      state.currentMaskDepth--;
    }
  },
  popClipRectangle(state: RenderState, data: RenderProxy2D, source: DisplayObject): void {
    const internal = state as DOMRenderStateInternal;
    const clipTarget = data.clipRectangleDepth - (source.clipRectangle != null ? 1 : 0);
    while (state.currentClipRectangleDepth > clipTarget) {
      internal.domClipStack.length--;
      state.currentClipRectangleDepth--;
    }
  },
  pushMask(state: RenderState, source: DisplayObject): void {
    if (source.mask === null) return;
    const maskData = getRenderProxy2D(state, source.mask);
    if (maskData === undefined) return;
    pushDOMMaskRectangle((state as DOMRenderStateInternal).domClipStack, maskData);
    state.currentMaskDepth++;
  },
  pushClipRectangle(state: RenderState, data: RenderProxy2D, source: DisplayObject): void {
    if (source.clipRectangle === null) return;
    pushDOMClipRectangle((state as DOMRenderStateInternal).domClipStack, source.clipRectangle, data.transform2D);
    state.currentClipRectangleDepth++;
  },
};
