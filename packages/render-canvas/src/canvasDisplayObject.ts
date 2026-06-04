import { createNullRendererData, getOrCreateDisplayObjectRenderNode } from '@flighthq/render';
import { getDisplayObjectRuntime } from '@flighthq/scene-display';
import type { CanvasRenderState, DisplayObject, DisplayObjectRenderer, DisplayObjectRenderNode } from '@flighthq/types';

export function drawCanvasDisplayObject(_state: CanvasRenderState, _renderNode: DisplayObjectRenderNode): void {
  // Plain display objects have no visual geometry of their own.
}

export function drawCanvasDisplayObjectMask(state: CanvasRenderState, data: DisplayObjectRenderNode): void {
  const children = getDisplayObjectRuntime(data.source as DisplayObject).children;
  if (children !== null) {
    for (let i = 0; i < children.length; i++) {
      const child = getOrCreateDisplayObjectRenderNode(state, children[i] as DisplayObject);
      state.displayObjectMaskRendererMap.get(child.source.kind)?.drawMask(state, child);
    }
  }
}

export const defaultCanvasDisplayObjectRenderer: DisplayObjectRenderer = {
  createData: createNullRendererData,
  draw: drawCanvasDisplayObject,
};
