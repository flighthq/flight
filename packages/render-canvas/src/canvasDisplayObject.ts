import { createNullRendererData } from '@flighthq/render';
import { getOrCreateDisplayObjectRenderNode } from '@flighthq/render-tree';
import { getDisplayObjectRuntime } from '@flighthq/scene-display';
import type {
  CanvasRenderState,
  DisplayObject,
  DisplayObjectRenderer,
  DisplayObjectRenderTreeNode,
} from '@flighthq/types';

export function drawCanvasDisplayObject(_state: CanvasRenderState, _renderNode: DisplayObjectRenderTreeNode): void {
  // Plain display objects have no visual geometry of their own.
}

export function drawCanvasDisplayObjectMask(state: CanvasRenderState, data: DisplayObjectRenderTreeNode): void {
  const children = getDisplayObjectRuntime(data.source).children;
  if (children !== null) {
    for (let i = 0; i < children.length; i++) {
      const child = getOrCreateDisplayObjectRenderNode(state, children[i] as DisplayObject);
      state.displayObjectMaskRendererMap.get(child.source.kind)?.drawMask(state, child);
    }
  }
}

export function renderCanvasDisplayObject(state: CanvasRenderState, source: DisplayObject): void {
  const currentFrameID = state.currentFrameID;
  const tempStack = state.tempStack;
  let stackLength = 0;

  tempStack[stackLength++] = source;

  while (stackLength > 0) {
    const current = tempStack[--stackLength] as DisplayObject;
    const data = getOrCreateDisplayObjectRenderNode(state, current);

    const isMask = data.isMaskFrameID === currentFrameID;
    if (isMask) continue;

    const shouldRender = data.visible && data.alpha > 0 && (data.transform2D.a !== 0 || data.transform2D.d !== 0);
    if (!shouldRender) continue;

    drawObject(state, data);

    if (!data.updateChildren) continue;

    const children = getDisplayObjectRuntime(current).children;
    if (children !== null) {
      for (let i = children.length - 1; i >= 0; i--) {
        tempStack[stackLength++] = children[i] as DisplayObject;
      }
    }
  }
}

function drawObject(state: CanvasRenderState, data: DisplayObjectRenderTreeNode): void {
  if (data.renderer === null) return;
  pushMaskObject(state, data);
  data.renderer.draw(state, data);
  popMaskObject(state, data);
}

function popMaskObject(
  state: CanvasRenderState,
  data: DisplayObjectRenderTreeNode,
  handleScrollRect: boolean = true,
): void {
  const source = data.source;
  if (source.mask !== null) state.displayObjectMaskHooks?.popMask(state, data);
  if (handleScrollRect && source.scrollRect !== null) state.scrollRectHooks?.pop(state);
}

function pushMaskObject(
  state: CanvasRenderState,
  data: DisplayObjectRenderTreeNode,
  handleScrollRect: boolean = true,
): void {
  const source = data.source;
  if (handleScrollRect && source.scrollRect !== null) state.scrollRectHooks?.push(state, data);
  if (source.mask !== null)
    state.displayObjectMaskHooks?.pushMask(state, getOrCreateDisplayObjectRenderNode(state, source.mask));
}

export const defaultCanvasDisplayObjectRenderer: DisplayObjectRenderer = {
  createData: createNullRendererData,
  draw: drawCanvasDisplayObject,
};
