import { acquireRenderCommand, createDisplayObjectRenderNode } from '@flighthq/render';
import { addSceneChild } from '@flighthq/scene';
import { createDisplayContainer, createDisplayObject } from '@flighthq/scene-display';
import { createSprite } from '@flighthq/scene-sprite';
import { RenderCommandKind } from '@flighthq/types';

import { prepareCanvasDisplayObjectRender, prepareCanvasSpriteRender, renderCanvas } from './canvasRender';
import { createCanvasRenderState } from './canvasRenderState';

function createState() {
  const canvas = document.createElement('canvas');
  const context = {
    getContextAttributes: vi.fn().mockReturnValue({ alpha: true, desynchronized: false }),
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high',
  } as unknown as CanvasRenderingContext2D;
  canvas.getContext = vi.fn().mockReturnValue(context);
  return createCanvasRenderState(canvas);
}

describe('prepareCanvasDisplayObjectRender', () => {
  it('fills the command pool with visible display objects in traversal order', () => {
    const state = createState();
    const root = createDisplayContainer();
    const child = createDisplayObject();
    addSceneChild(root, child);

    prepareCanvasDisplayObjectRender(state, root);

    expect(state.commandPool.commandCount).toBe(2);
    expect(state.commandPool.commands[0].kind).toBe(RenderCommandKind.DrawNode);
    expect(state.commandPool.commands[0].node.source).toBe(root);
    expect(state.commandPool.commands[1].kind).toBe(RenderCommandKind.DrawNode);
    expect(state.commandPool.commands[1].node.source).toBe(child);
  });
});

describe('prepareCanvasSpriteRender', () => {
  it('fills the command pool with visible sprite nodes in traversal order', () => {
    const state = createState();
    const root = createSprite();
    const child = createSprite();
    addSceneChild(root, child);

    prepareCanvasSpriteRender(state, root);

    expect(state.commandPool.commandCount).toBe(2);
    expect(state.commandPool.commands[0].kind).toBe(RenderCommandKind.DrawNode);
    expect(state.commandPool.commands[0].node.source).toBe(root);
    expect(state.commandPool.commands[1].kind).toBe(RenderCommandKind.DrawNode);
    expect(state.commandPool.commands[1].node.source).toBe(child);
  });
});

describe('renderCanvas', () => {
  it('executes commands from the render state command pool', () => {
    const state = createState();
    const node = createDisplayObjectRenderNode(state, createDisplayObject());
    node.renderer = { createData: () => null, draw: vi.fn() };
    acquireRenderCommand(state.commandPool, RenderCommandKind.DrawNode, node);

    renderCanvas(state);

    expect(node.renderer.draw).toHaveBeenCalledWith(state, node);
  });
});
