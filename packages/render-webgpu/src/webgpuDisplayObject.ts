import { getDisplayObjectRuntime } from '@flighthq/displayobject';
import { getDisplayObjectRenderNode, isRenderNodeVisible, noopRendererData } from '@flighthq/render';
import type { DisplayObject, DisplayObjectRenderer, DisplayObjectRenderNode, WebGPURenderState } from '@flighthq/types';

export function drawWebGPUDisplayObject(_state: WebGPURenderState, _renderNode: DisplayObjectRenderNode): void {
  // Plain display objects have no visual geometry of their own.
}

export function drawWebGPUDisplayObjectMask(state: WebGPURenderState, data: DisplayObjectRenderNode): void {
  const children = getDisplayObjectRuntime(data.source as DisplayObject).children;
  if (children !== null) {
    for (let i = 0; i < children.length; i++) {
      const child = getDisplayObjectRenderNode(state, children[i] as DisplayObject);
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

    const data = getDisplayObjectRenderNode(state, current);
    if (data === undefined || data.isMaskFrameID === frameID) continue;

    clipHooks?.popMask(state, data);
    clipHooks?.popClipRectangle(state, data);

    if (!isRenderNodeVisible(data)) continue;

    clipHooks?.pushMask(state, current);

    data.renderer?.draw(state, data);

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
  draw: drawWebGPUDisplayObject,
};
