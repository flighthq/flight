import { createNullRendererData, getOrCreateDisplayObjectRenderNode, isRenderNodeVisible } from '@flighthq/render';
import { getDisplayObjectRuntime } from '@flighthq/scene-display';
import type {
  CanvasRenderState,
  DisplayObject,
  DisplayObjectMaskHooks,
  DisplayObjectRenderer,
  DisplayObjectRenderNode,
  ScrollRectangleHooks,
} from '@flighthq/types';

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

export function renderCanvasDisplayObject(state: CanvasRenderState, source: DisplayObject): void {
  const tempStack = state.tempStack;
  const frameID = state.currentFrameID;
  const maskHooks = state.displayObjectMaskHooks;
  const scrollRectHooks = state.scrollRectangleHooks;

  let stackLength = 1;
  tempStack[0] = source;

  const pendingPops: CanvasRenderPop[] = [];

  while (stackLength > 0) {
    const current = tempStack[--stackLength] as DisplayObject;

    if (!current.enabled) {
      drainCanvasPops(state, maskHooks, scrollRectHooks, pendingPops, stackLength);
      continue;
    }

    const data = state.renderNodeMap.get(current) as DisplayObjectRenderNode | undefined;
    if (data === undefined) {
      drainCanvasPops(state, maskHooks, scrollRectHooks, pendingPops, stackLength);
      continue;
    }

    if (data.isMaskFrameID === frameID) {
      drainCanvasPops(state, maskHooks, scrollRectHooks, pendingPops, stackLength);
      continue;
    }

    if (!isRenderNodeVisible(data)) {
      drainCanvasPops(state, maskHooks, scrollRectHooks, pendingPops, stackLength);
      continue;
    }

    const mask = current.mask;
    let maskData: DisplayObjectRenderNode | undefined;
    if (maskHooks !== null && mask !== null) {
      maskData = state.renderNodeMap.get(mask) as DisplayObjectRenderNode | undefined;
      if (maskData !== undefined) maskHooks.pushMask(state, maskData);
    }

    if (data.renderer !== null) data.renderer.draw(state, data);

    const prePushLength = stackLength;

    if (data.traverseChildren) {
      const children = getDisplayObjectRuntime(current).children;
      if (children !== null) {
        for (let i = children.length - 1; i >= 0; i--) {
          tempStack[stackLength++] = children[i] as DisplayObject;
        }
      }
    }

    if (maskData !== undefined) {
      pendingPops.push({ atStackLength: prePushLength, kind: 'mask', node: maskData });
    }

    if (scrollRectHooks !== null && current.scrollRectangle !== null && stackLength > prePushLength) {
      scrollRectHooks.push(state, data);
      pendingPops.push({ atStackLength: prePushLength, kind: 'scrollRect', node: data });
    }

    drainCanvasPops(state, maskHooks, scrollRectHooks, pendingPops, stackLength);
  }

  for (let i = pendingPops.length - 1; i >= 0; i--) {
    const pop = pendingPops[i];
    if (pop.kind === 'mask') maskHooks!.popMask(state, pop.node);
    else scrollRectHooks!.pop(state);
  }
}

interface CanvasRenderPop {
  atStackLength: number;
  kind: 'mask' | 'scrollRect';
  node: DisplayObjectRenderNode;
}

function drainCanvasPops(
  state: CanvasRenderState,
  maskHooks: DisplayObjectMaskHooks | null,
  scrollRectHooks: ScrollRectangleHooks | null,
  pendingPops: CanvasRenderPop[],
  stackLength: number,
): void {
  while (pendingPops.length > 0) {
    const top = pendingPops[pendingPops.length - 1];
    if (top.atStackLength < stackLength) break;
    pendingPops.pop();
    if (top.kind === 'mask') maskHooks!.popMask(state, top.node);
    else scrollRectHooks!.pop(state);
  }
}
