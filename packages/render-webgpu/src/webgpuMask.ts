import { getDisplayObjectRuntime } from '@flighthq/displayobject';
import { getRenderNode2D } from '@flighthq/render';
import type { DisplayObject, RenderNode2D } from '@flighthq/types';

import type { WebGPURenderStateInternal } from './internal';

export function drawWebGPUMask(state: WebGPURenderStateInternal, data: RenderNode2D): void {
  state.displayObjectMaskRendererMap.get(data.source.kind)?.drawMask(state, data);

  if (!data.traverseChildren) return;

  const children = getDisplayObjectRuntime(data.source as DisplayObject).children;
  if (children !== null) {
    for (let i = 0; i < children.length; i++) {
      const child = getRenderNode2D(state, children[i] as DisplayObject);
      if (child !== undefined) drawWebGPUMask(state, child);
    }
  }
}

export function popWebGPUMask(state: WebGPURenderStateInternal): void {
  const nextDepth = Math.max(0, state.currentMaskDepth - 1);
  state.currentMaskDepth = nextDepth;
  state.maskWriteMode = false;
}

export function pushWebGPUMask(state: WebGPURenderStateInternal, data: RenderNode2D): void {
  state.maskWriteMode = true;
  // stencil reference is set in drawWebGPUQuad when maskWriteMode is active
  const nextDepth = state.currentMaskDepth + 1;

  // Draw the mask geometry using the stencil-write pipeline
  if (state.renderPass !== null) {
    state.renderPass.setStencilReference(nextDepth);
  }
  drawWebGPUMask(state, data);

  state.maskWriteMode = false;
  state.currentMaskDepth = nextDepth;
}
