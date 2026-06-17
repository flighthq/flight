import { getDisplayObjectRuntime } from '@flighthq/displayobject';
import { getRenderNode2D, isRenderNodeVisible, noopRendererData } from '@flighthq/render';
import type { DisplayObject, DisplayObjectRenderer, RenderNode2D, WebGPURenderState } from '@flighthq/types';

export function drawWebGPUDisplayObject(_state: WebGPURenderState, _renderNode: RenderNode2D): void {
  // Plain display objects have no visual geometry of their own.
}

export function drawWebGPUDisplayObjectMask(state: WebGPURenderState, data: RenderNode2D): void {
  const children = getDisplayObjectRuntime(data.source as DisplayObject).children;
  if (children !== null) {
    for (let i = 0; i < children.length; i++) {
      const child = getRenderNode2D(state, children[i] as DisplayObject);
      if (child !== undefined) {
        state.displayObjectMaskRendererMap.get(child.source.kind)?.drawMask(state, child);
      }
    }
  }
}

export function renderWebGPUDisplayObject(state: WebGPURenderState, source: DisplayObject): void {
  const frameID = state.currentFrameID;
  const tempStack = state.tempStack;
  const clipHooks = state.displayObjectClipHooks;

  let stackLength = 1;
  tempStack[0] = source;

  while (stackLength > 0) {
    const current = tempStack[--stackLength] as DisplayObject;
    if (!current.enabled) continue;

    const data = getRenderNode2D(state, current);
    if (data === undefined || data.isMaskFrameID === frameID) continue;

    clipHooks?.popMask(state, data);
    clipHooks?.popClipRectangle(state, data);

    if (!isRenderNodeVisible(data)) continue;

    clipHooks?.pushMask(state, current);

    data.renderer?.submit(state, data);

    const prePushLength = stackLength;
    if (data.traverseChildren) {
      const children = getDisplayObjectRuntime(current).children;
      if (children !== null) {
        for (let i = children.length - 1; i >= 0; i--) {
          tempStack[stackLength++] = children[i] as DisplayObject;
        }
      }
    }

    clipHooks?.pushClipRectangle(state, data, current, stackLength > prePushLength);
  }

  clipHooks?.finalize(state);
}

export const defaultWebGPUDisplayObjectRenderer: DisplayObjectRenderer = {
  createData: noopRendererData,
  submit: drawWebGPUDisplayObject,
};
