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

export function enableWebGLClipRectangleSupport(state: WebGLRenderState): void {
  state.displayObjectClipHooks = webglClipHooks;
  enableRenderFeatures(state, RenderFeatures.ClipRectangle);
}

export function enableWebGLMaskSupport(state: WebGLRenderState): void {
  state.displayObjectClipHooks = webglClipHooks;
  enableRenderFeatures(state, RenderFeatures.Masks);
}

const webglClipHooks: DisplayObjectClipHooks = {
  finalize(state: RenderState): void {
    const s = state as WebGLRenderStateInternal;
    while (s.currentMaskDepth > 0) popWebGLMask(s);
    while (s.currentClipRectangleDepth > 0) {
      popWebGLClipRectangle(s);
      s.currentClipRectangleDepth--;
    }
  },
  popMask(state: RenderState, data: DisplayObjectRenderNode): void {
    const s = state as WebGLRenderStateInternal;
    while (s.currentMaskDepth > data.maskDepth) popWebGLMask(s);
  },
  popClipRectangle(state: RenderState, data: DisplayObjectRenderNode): void {
    const s = state as WebGLRenderStateInternal;
    while (s.currentClipRectangleDepth > data.clipRectangleDepth) {
      popWebGLClipRectangle(s);
      s.currentClipRectangleDepth--;
    }
  },
  pushMask(state: RenderState, source: DisplayObject): void {
    if (source.mask === null) return;
    const maskData = getDisplayObjectRenderNode(state, source.mask);
    if (maskData === undefined) return;
    pushWebGLMask(state as WebGLRenderStateInternal, maskData);
  },
  pushClipRectangle(
    state: RenderState,
    data: DisplayObjectRenderNode,
    source: DisplayObject,
    hasChildren: boolean,
  ): void {
    if (!hasChildren || source.clipRectangle === null) return;
    pushWebGLClipRectangle(state as WebGLRenderStateInternal, source.clipRectangle, data.transform2D);
    state.currentClipRectangleDepth++;
  },
};
