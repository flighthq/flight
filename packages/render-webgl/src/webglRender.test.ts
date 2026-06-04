import { acquireRenderCommand, createDisplayObjectRenderNode } from '@flighthq/render';
import { addSceneChild } from '@flighthq/scene';
import { createDisplayContainer, createDisplayObject } from '@flighthq/scene-display';
import { createSprite } from '@flighthq/scene-sprite';
import { RenderCommandKind } from '@flighthq/types';

import { prepareWebGLDisplayObjectRender, prepareWebGLSpriteRender, renderWebGL } from './webglRender';
import { makeWebGLState } from './webglTestHelper';

describe('prepareWebGLDisplayObjectRender', () => {
  it('fills the command pool with visible display objects in traversal order', () => {
    const { state } = makeWebGLState();
    const root = createDisplayContainer();
    const child = createDisplayObject();
    addSceneChild(root, child);

    prepareWebGLDisplayObjectRender(state, root);

    expect(state.commandPool.commandCount).toBe(2);
    expect(state.commandPool.commands[0].kind).toBe(RenderCommandKind.DrawNode);
    expect(state.commandPool.commands[0].node.source).toBe(root);
    expect(state.commandPool.commands[1].kind).toBe(RenderCommandKind.DrawNode);
    expect(state.commandPool.commands[1].node.source).toBe(child);
  });
});

describe('prepareWebGLSpriteRender', () => {
  it('fills the command pool with visible sprite nodes in traversal order', () => {
    const { state } = makeWebGLState();
    const root = createSprite();
    const child = createSprite();
    addSceneChild(root, child);

    prepareWebGLSpriteRender(state, root);

    expect(state.commandPool.commandCount).toBe(2);
    expect(state.commandPool.commands[0].kind).toBe(RenderCommandKind.DrawNode);
    expect(state.commandPool.commands[0].node.source).toBe(root);
    expect(state.commandPool.commands[1].kind).toBe(RenderCommandKind.DrawNode);
    expect(state.commandPool.commands[1].node.source).toBe(child);
  });
});

describe('renderWebGL', () => {
  it('executes commands from the render state command pool', () => {
    const { state } = makeWebGLState();
    const node = createDisplayObjectRenderNode(state, createDisplayObject());
    node.renderer = { createData: () => null, draw: vi.fn() };
    acquireRenderCommand(state.commandPool, RenderCommandKind.DrawNode, node);

    renderWebGL(state);

    expect(node.renderer.draw).toHaveBeenCalledWith(state, node);
  });
});
