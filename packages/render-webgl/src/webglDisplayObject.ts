import { getOrCreateDisplayObjectRenderNode } from '@flighthq/render-tree';
import { getDisplayObjectRuntime } from '@flighthq/scene-display';
import type {
  DisplayObject,
  DisplayObjectRenderer,
  DisplayObjectRenderTreeNode,
  WebGLRenderState,
} from '@flighthq/types';

export function drawWebGLDisplayObject(_state: WebGLRenderState, _renderNode: DisplayObjectRenderTreeNode): void {
  // Plain display objects have no visual geometry of their own.
}

export function drawWebGLDisplayObjectMask(state: WebGLRenderState, data: DisplayObjectRenderTreeNode): void {
  const children = getDisplayObjectRuntime(data.source).children;
  if (children !== null) {
    for (let i = 0; i < children.length; i++) {
      const child = getOrCreateDisplayObjectRenderNode(state, children[i] as DisplayObject);
      state.displayObjectMaskRendererMap.get(child.source.kind)?.drawMask(state, child);
    }
  }
}

export function renderWebGLDisplayObject(state: WebGLRenderState, source: DisplayObject): void {
  drawNode(state, source);
}

export const defaultWebGLDisplayObjectRenderer: DisplayObjectRenderer = {
  createData: () => null,
  draw: drawWebGLDisplayObject,
};

function drawNode(state: WebGLRenderState, current: DisplayObject): void {
  const data = getOrCreateDisplayObjectRenderNode(state, current);

  const isMask = data.isMaskFrameID === state.currentFrameID;
  if (isMask) return;

  const shouldRender = data.visible && data.alpha > 0 && (data.transform2D.a !== 0 || data.transform2D.d !== 0);
  if (!shouldRender) return;

  pushObjectEffects(state, data);

  if (data.renderer !== null) {
    data.renderer.draw(state, data);
  }

  if (data.updateChildren) {
    const children = getDisplayObjectRuntime(current).children;
    if (children !== null) {
      for (let i = 0; i < children.length; i++) {
        drawNode(state, children[i] as DisplayObject);
      }
    }
  }

  popObjectEffects(state, data);
}

function popObjectEffects(state: WebGLRenderState, data: DisplayObjectRenderTreeNode): void {
  const source = data.source;
  if (source.mask !== null) state.displayObjectMaskHooks?.popMask(state, data);
  if (source.scrollRectangle !== null) state.scrollRectangleHooks?.pop(state);
}

function pushObjectEffects(state: WebGLRenderState, data: DisplayObjectRenderTreeNode): void {
  const source = data.source;
  if (source.scrollRectangle !== null) state.scrollRectangleHooks?.push(state, data);
  if (source.mask !== null)
    state.displayObjectMaskHooks?.pushMask(state, getOrCreateDisplayObjectRenderNode(state, source.mask));
}
