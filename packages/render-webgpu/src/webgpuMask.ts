import { getDisplayObjectRuntime } from '@flighthq/displayobject';
import { getRenderProxy2D } from '@flighthq/render';
import type { DisplayObject, RenderProxy2D } from '@flighthq/types';

import type { WebGPURenderStateInternal } from './internal';
import { flushWebGPUSpriteBatch } from './webgpuSpriteBatch';

export function drawWebGPUMask(state: WebGPURenderStateInternal, data: RenderProxy2D): void {
  state.displayObjectMaskRendererMap.get(data.source.kind)?.drawMask(state, data);

  if (!data.traverseChildren) return;

  const children = getDisplayObjectRuntime(data.source as DisplayObject).children;
  if (children !== null) {
    for (let i = 0; i < children.length; i++) {
      const child = getRenderProxy2D(state, children[i] as DisplayObject);
      if (child !== undefined) drawWebGPUMask(state, child);
    }
  }
}

export function popWebGPUMask(state: WebGPURenderStateInternal): void {
  flushWebGPUSpriteBatch(state);
  const nextDepth = Math.max(0, state.currentMaskDepth - 1);
  state.currentMaskDepth = nextDepth;
  state.maskWriteMode = false;
}

export function pushWebGPUMask(state: WebGPURenderStateInternal, data: RenderProxy2D): void {
  flushWebGPUSpriteBatch(state);
  state.maskWriteMode = true;
  const nextDepth = state.currentMaskDepth + 1;

  // Draw the mask geometry into the stencil buffer. The reference is set explicitly here because
  // currentMaskDepth is not advanced to nextDepth until after the mask draw; the batch flush below
  // selects the stencil-write pipeline because maskWriteMode is true.
  if (state.renderPass !== null) {
    state.renderPass.setStencilReference(nextDepth);
  }
  drawWebGPUMask(state, data);
  flushWebGPUSpriteBatch(state);

  state.maskWriteMode = false;
  state.currentMaskDepth = nextDepth;
}
