import { getRenderProxy2D, isRenderProxyVisible, noopRendererData } from '@flighthq/render/contract';
import { getNode2DRuntime } from '@flighthq/scene2d/contract';
import type { CanvasRenderState, Node2D, RenderProxy2D, Scene2DRenderer } from '@flighthq/types/contract';

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
    if (isCanvasTransformDegenerate(data)) continue;

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

// Zero-determinant transforms collapse the node to a line or point — Canvas 2D would draw nothing
// visible but still pay transform setup and draw-call overhead. isRenderProxyVisible catches the
// a===0 && d===0 case (identity-scaled to zero); this catches the remaining degenerate orientations
// (e.g. rotated then scaled to zero on one axis) via the full 2×2 determinant.
function isCanvasTransformDegenerate(data: RenderProxy2D): boolean {
  const t = data.transform2D;
  return t.a * t.d - t.b * t.c === 0;
}
