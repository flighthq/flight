import { enableRenderFeatures, getRenderNode2D } from '@flighthq/render';
import type {
  DisplayObject,
  DisplayObjectClipHooks,
  RenderNode2D,
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
  popMask(state: RenderState, data: RenderNode2D): void {
    const s = state as WebGPURenderStateInternal;
    while (s.currentMaskDepth > data.maskDepth) popWebGPUMask(s);
  },
  popClipRectangle(state: RenderState, data: RenderNode2D): void {
    const s = state as WebGPURenderStateInternal;
    while (s.currentClipRectangleDepth > data.clipRectangleDepth) {
      popWebGPUClipRectangle(s);
      s.currentClipRectangleDepth--;
    }
  },
  pushMask(state: RenderState, source: DisplayObject): void {
    if (source.mask === null) return;
    const maskData = getRenderNode2D(state, source.mask);
    if (maskData === undefined) return;
    pushWebGPUMask(state as WebGPURenderStateInternal, maskData);
  },
  pushClipRectangle(state: RenderState, data: RenderNode2D, source: DisplayObject, hasChildren: boolean): void {
    if (!hasChildren || source.clipRectangle === null) return;
    pushWebGPUClipRectangle(state as WebGPURenderStateInternal, source.clipRectangle, data.transform2D);
    state.currentClipRectangleDepth++;
  },
};
