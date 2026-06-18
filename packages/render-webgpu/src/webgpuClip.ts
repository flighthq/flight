import { enableRenderFeatures, getRenderProxy2D } from '@flighthq/render';
import type {
  DisplayObject,
  DisplayObjectClipHooks,
  RenderProxy2D,
  RenderState,
  WebGPURenderState,
} from '@flighthq/types';
import { RenderFeatures } from '@flighthq/types';

import type { WebGPURenderStateInternal } from './internal';
import { popWebGPUClipRectangle, pushWebGPUClipRectangle } from './webgpuClipRectangle';
import { popWebGPUMask, pushWebGPUMask } from './webgpuMask';

export function enableWebGPUClipRectangleSupport(state: WebGPURenderState): void {
  state.displayObjectClipHooks = webgpuClipHooks;
  enableRenderFeatures(state, RenderFeatures.ClipRectangle);
}

export function enableWebGPUMaskSupport(state: WebGPURenderState): void {
  state.displayObjectClipHooks = webgpuClipHooks;
  enableRenderFeatures(state, RenderFeatures.Masks);
}

const webgpuClipHooks: DisplayObjectClipHooks = {
  finalize(state: RenderState): void {
    const s = state as WebGPURenderStateInternal;
    while (s.currentMaskDepth > 0) popWebGPUMask(s);
    while (s.currentClipRectangleDepth > 0) {
      popWebGPUClipRectangle(s);
      s.currentClipRectangleDepth--;
    }
  },
  popMask(state: RenderState, data: RenderProxy2D): void {
    const s = state as WebGPURenderStateInternal;
    while (s.currentMaskDepth > data.maskDepth) popWebGPUMask(s);
  },
  popClipRectangle(state: RenderState, data: RenderProxy2D, source: DisplayObject): void {
    const s = state as WebGPURenderStateInternal;
    const clipTarget = data.clipRectangleDepth - (source.clipRectangle != null ? 1 : 0);
    while (s.currentClipRectangleDepth > clipTarget) {
      popWebGPUClipRectangle(s);
      s.currentClipRectangleDepth--;
    }
  },
  pushMask(state: RenderState, source: DisplayObject): void {
    if (source.mask === null) return;
    const maskData = getRenderProxy2D(state, source.mask);
    if (maskData === undefined) return;
    pushWebGPUMask(state as WebGPURenderStateInternal, maskData);
  },
  pushClipRectangle(state: RenderState, data: RenderProxy2D, source: DisplayObject): void {
    if (source.clipRectangle === null) return;
    pushWebGPUClipRectangle(state as WebGPURenderStateInternal, source.clipRectangle, data.transform2D);
    state.currentClipRectangleDepth++;
  },
};
