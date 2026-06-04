import { buildRenderCommands, createNullRendererData } from '@flighthq/render';
import { getOrCreateDisplayObjectRenderNode } from '@flighthq/render';
import { getDisplayObjectRuntime } from '@flighthq/scene-display';
import type { CanvasRenderState, DisplayObject, DisplayObjectRenderer, DisplayObjectRenderNode } from '@flighthq/types';
import { RenderCommandKind } from '@flighthq/types';

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

export function renderCanvasDisplayObject(state: CanvasRenderState, source: DisplayObject): void {
  buildRenderCommands(state, source);

  const pool = state.commandPool;
  const count = pool.commandCount;
  const cmds = pool.commands;

  for (let i = 0; i < count; i++) {
    const cmd = cmds[i];
    const data = cmd.node as DisplayObjectRenderNode;
    switch (cmd.kind) {
      case RenderCommandKind.DrawNode:
        if (data.renderer !== null) data.renderer.draw(state, data);
        break;
      case RenderCommandKind.PushMask:
        state.displayObjectMaskHooks?.pushMask(state, data);
        break;
      case RenderCommandKind.PopMask:
        state.displayObjectMaskHooks?.popMask(state, data);
        break;
      case RenderCommandKind.PushScrollRect:
        state.scrollRectangleHooks?.push(state, data);
        break;
      case RenderCommandKind.PopScrollRect:
        state.scrollRectangleHooks?.pop(state);
        break;
    }
  }
}

export const defaultCanvasDisplayObjectRenderer: DisplayObjectRenderer = {
  createData: createNullRendererData,
  draw: drawCanvasDisplayObject,
};
