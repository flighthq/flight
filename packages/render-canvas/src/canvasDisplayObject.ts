import { getDisplayObjectRuntime } from '@flighthq/displayobject';
import { getRenderProxy2D, isRenderProxyVisible, noopRendererData } from '@flighthq/render';
import type { CanvasRenderState, DisplayObject, DisplayObjectRenderer, RenderProxy2D } from '@flighthq/types';

import { resolveCanvasCSSFilter } from './canvasCSSFilterBinding';
import { getCanvasRenderStateRuntime } from './canvasRenderState';

export function drawCanvasDisplayObject(_state: CanvasRenderState, _renderProxy: RenderProxy2D): void {
  // Plain display objects have no visual geometry of their own.
}

export const defaultCanvasDisplayObjectRenderer: DisplayObjectRenderer = {
  createData: noopRendererData,
  submit: drawCanvasDisplayObject,
};

export function renderCanvasDisplayObject(state: CanvasRenderState, source: DisplayObject): void {
  const tempStack = getCanvasRenderStateRuntime(state).tempStack;
  const clipHooks = state.displayObjectClipHooks;

  let stackLength = 1;
  tempStack[0] = source;

  while (stackLength > 0) {
    const current = tempStack[--stackLength] as DisplayObject;
    if (!current.enabled) continue;

    const data = getRenderProxy2D(state, current);
    if (data === undefined) continue;

    clipHooks?.popClip(state, data, current);

    if (!isRenderProxyVisible(data)) continue;

    clipHooks?.pushClip(state, data, current);

    const filter = resolveCanvasCSSFilter(state, data);
    if (filter !== null) state.context.filter = filter;
    if (data.renderer !== null) data.renderer.submit(state, data);
    if (filter !== null) state.context.filter = 'none';
    if (data.traverseChildren) {
      const children = getDisplayObjectRuntime(current).children;
      if (children !== null) {
        for (let i = children.length - 1; i >= 0; i--) {
          tempStack[stackLength++] = children[i] as DisplayObject;
        }
      }
    }
  }

  clipHooks?.finalize(state);
}
