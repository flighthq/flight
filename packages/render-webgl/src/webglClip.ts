import { enableDisplayObjectMaskPass, getRenderProxy2D } from '@flighthq/render';
import type {
  DisplayObject,
  DisplayObjectClipHooks,
  RenderProxy2D,
  RenderState,
  WebGLRenderState,
} from '@flighthq/types';

import type { WebGLRenderStateInternal } from './internal';
import { popWebGLClipRectangle, pushWebGLClipRectangle } from './webglClipRectangle';
import { popWebGLMask, pushWebGLMask } from './webglMask';

export function enableWebGLClipRectangleSupport(state: WebGLRenderState): void {
  state.displayObjectClipHooks = webglClipHooks;
}

export function enableWebGLMaskSupport(state: WebGLRenderState): void {
  state.displayObjectClipHooks = webglClipHooks;
  enableDisplayObjectMaskPass(state);
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
  popMask(state: RenderState, data: RenderProxy2D): void {
    const s = state as WebGLRenderStateInternal;
    while (s.currentMaskDepth > data.maskDepth) popWebGLMask(s);
  },
  popClipRectangle(state: RenderState, data: RenderProxy2D): void {
    const s = state as WebGLRenderStateInternal;
    while (s.currentClipRectangleDepth > data.clipRectangleDepth) {
      popWebGLClipRectangle(s);
      s.currentClipRectangleDepth--;
    }
  },
  pushMask(state: RenderState, source: DisplayObject): void {
    if (source.mask === null) return;
    const maskData = getRenderProxy2D(state, source.mask);
    if (maskData === undefined) return;
    pushWebGLMask(state as WebGLRenderStateInternal, maskData);
  },
  pushClipRectangle(state: RenderState, data: RenderProxy2D, source: DisplayObject, hasChildren: boolean): void {
    if (!hasChildren || source.clipRectangle === null) return;
    pushWebGLClipRectangle(state as WebGLRenderStateInternal, source.clipRectangle, data.transform2D);
    state.currentClipRectangleDepth++;
  },
};
