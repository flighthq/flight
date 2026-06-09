import { createNullRendererData, getDisplayObjectRenderNode, isRenderNodeVisible } from '@flighthq/render';
import { getDisplayObjectRuntime } from '@flighthq/scene-display';
import type { CanvasRenderState, DisplayObject, DisplayObjectRenderer, DisplayObjectRenderNode } from '@flighthq/types';

import { selectCanvasCSSFilter } from './canvasCSSFilterBinding';

export function drawCanvasDisplayObject(_state: CanvasRenderState, _renderNode: DisplayObjectRenderNode): void {
  // Plain display objects have no visual geometry of their own.
}

export function drawCanvasDisplayObjectMask(state: CanvasRenderState, data: DisplayObjectRenderNode): void {
  const children = getDisplayObjectRuntime(data.source as DisplayObject).children;
  if (children !== null) {
    for (let i = 0; i < children.length; i++) {
      const child = getDisplayObjectRenderNode(state, children[i] as DisplayObject);
      if (child !== undefined) state.displayObjectMaskRendererMap.get(child.source.kind)?.drawMask(state, child);
    }
  }
}

export const defaultCanvasDisplayObjectRenderer: DisplayObjectRenderer = {
  createData: createNullRendererData,
  draw: drawCanvasDisplayObject,
};

export function renderCanvasDisplayObject(state: CanvasRenderState, source: DisplayObject): void {
  const tempStack = state.tempStack;
  const frameID = state.currentFrameID;
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

    const filter = selectCanvasCSSFilter(state, data);
    if (filter !== null) state.context.filter = filter;
    if (data.renderer !== null) data.renderer.draw(state, data);
    if (filter !== null) state.context.filter = 'none';

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
