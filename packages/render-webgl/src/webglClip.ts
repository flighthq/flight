import { enableRenderFeatures, getDisplayObjectRenderNode } from '@flighthq/render';
import type {
  DisplayObject,
  DisplayObjectClipHooks,
  DisplayObjectRenderNode,
  RenderState,
  WebGLRenderState,
} from '@flighthq/types';
import { RenderFeatures } from '@flighthq/types';

import type { WebGLRenderStateInternal } from './internal';
import { popWebGLClipRectangle, pushWebGLClipRectangle } from './webglClipRect';
import { popWebGLMask, pushWebGLMask } from './webglMask';

export function enableWebGLMaskSupport(state: WebGLRenderState): void {
  state.displayObjectClipHooks = webglClipHooks;
  enableRenderFeatures(state, RenderFeatures.Masks);
}

export function enableWebGLScrollRectangleSupport(state: WebGLRenderState): void {
  state.displayObjectClipHooks = webglClipHooks;
  enableRenderFeatures(state, RenderFeatures.ScrollRectangle);
}

const webglClipHooks: DisplayObjectClipHooks = {
  finalize(state: RenderState): void {
    const s = state as WebGLRenderStateInternal;
    while (s.currentMaskDepth > 0) popWebGLMask(s);
    while (s.currentScrollRectangleDepth > 0) {
      popWebGLClipRectangle(s);
      s.currentScrollRectangleDepth--;
    }
  },
  popMask(state: RenderState, data: DisplayObjectRenderNode): void {
    const s = state as WebGLRenderStateInternal;
    while (s.currentMaskDepth > data.maskDepth) popWebGLMask(s);
  },
  popScrollRectangle(state: RenderState, data: DisplayObjectRenderNode): void {
    const s = state as WebGLRenderStateInternal;
    while (s.currentScrollRectangleDepth > data.scrollRectangleDepth) {
      popWebGLClipRectangle(s);
      s.currentScrollRectangleDepth--;
    }
  },
  pushMask(state: RenderState, source: DisplayObject): void {
    if (source.mask === null) return;
    const maskData = getDisplayObjectRenderNode(state, source.mask);
    if (maskData === undefined) return;
    pushWebGLMask(state as WebGLRenderStateInternal, maskData);
  },
  pushScrollRectangle(
    state: RenderState,
    data: DisplayObjectRenderNode,
    source: DisplayObject,
    hasChildren: boolean,
  ): void {
    if (!hasChildren || source.scrollRectangle === null) return;
    pushWebGLClipRectangle(state as WebGLRenderStateInternal, source.scrollRectangle, data.transform2D);
    state.currentScrollRectangleDepth++;
  },
};
