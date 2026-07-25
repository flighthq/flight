import { getNode2DRuntime } from '@flighthq/displayobject';
import { getRenderProxy2D, isRenderProxyVisible, noopRendererData } from '@flighthq/render';
import type { CanvasRenderState, Node2D, Scene2DRenderer, RenderProxy2D } from '@flighthq/types';

import { resolveCanvasCssFilter } from './canvasCSSFilterBinding';
import { getCanvasRenderStateRuntime } from './canvasRenderState';

export function drawCanvasScene2D(_state: CanvasRenderState, _renderProxy: RenderProxy2D): void {
  // Plain display objects have no visual geometry of their own.
}

export const defaultCanvasScene2DRenderer: Scene2DRenderer = {
  createData: noopRendererData,
  submit: drawCanvasScene2D,
};

export function renderCanvasScene2D(state: CanvasRenderState, source: Node2D): void {
  const tempStack = getCanvasRenderStateRuntime(state).tempStack;
  const clipHooks = state.displayObjectClipHooks;

  let stackLength = 1;
  tempStack[0] = source;

  while (stackLength > 0) {
    const current = tempStack[--stackLength] as Node2D;
    if (!current.enabled) continue;

    const data = getRenderProxy2D(state, current);
    if (data === undefined) continue;

    clipHooks?.popClip(state, data, current);

    if (!isRenderProxyVisible(data)) continue;

    clipHooks?.pushClip(state, data, current);

    const filter = resolveCanvasCssFilter(state, data);
    if (filter !== null) state.context.filter = filter;
    if (data.renderer !== null) data.renderer.submit(state, data);
    if (filter !== null) state.context.filter = 'none';
    if (data.traverseChildren) {
      const children = getNode2DRuntime(current).children;
      if (children !== null) {
        for (let i = children.length - 1; i >= 0; i--) {
          tempStack[stackLength++] = children[i] as Node2D;
        }
      }
    }
  }

  clipHooks?.finalize(state);
}
