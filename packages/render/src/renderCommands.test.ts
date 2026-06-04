import { createRectangle } from '@flighthq/geometry';
import { addSceneChild } from '@flighthq/scene';
import { createDisplayObject } from '@flighthq/scene-display';
import { RenderCommandKind, RenderFeatures } from '@flighthq/types';

import { acquireRenderCommand } from './renderCommandPool';
import { buildRenderCommands, executeRenderCommands } from './renderCommands';
import { enableRenderFeatures } from './renderer';
import { getOrCreateDefaultDisplayObjectRenderNode } from './renderNode2d';
import { createRenderState } from './renderState';
import { updateDisplayObject } from './update';

function makeVisibleNode(state: ReturnType<typeof createRenderState>, obj: ReturnType<typeof createDisplayObject>) {
  updateDisplayObjectBeforeRender(state, obj);
  const data = getOrCreateDefaultDisplayObjectRenderNode(state, obj);
  data.visible = true;
  data.alpha = 1;
  data.transform2D.a = 1;
  data.transform2D.d = 1;
  return data;
}

function commands(state: ReturnType<typeof createRenderState>) {
  return state.commandPool.commands.slice(0, state.commandPool.commandCount);
}

describe('buildRenderCommands', () => {
  it('produces no commands for a disabled object', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    obj.enabled = false;
    buildRenderCommands(state, obj);
    expect(state.commandPool.commandCount).toBe(0);
  });

  it('produces no commands for an invisible object', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    updateDisplayObjectBeforeRender(state, obj);
    const data = getOrCreateDefaultDisplayObjectRenderNode(state, obj);
    data.visible = false;
    buildRenderCommands(state, obj);
    expect(state.commandPool.commandCount).toBe(0);
  });

  it('produces no commands for zero alpha', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    updateDisplayObjectBeforeRender(state, obj);
    const data = getOrCreateDefaultDisplayObjectRenderNode(state, obj);
    data.visible = true;
    data.alpha = 0;
    data.transform2D.a = 1;
    data.transform2D.d = 1;
    buildRenderCommands(state, obj);
    expect(state.commandPool.commandCount).toBe(0);
  });

  it('produces no commands for zero scale', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    updateDisplayObjectBeforeRender(state, obj);
    const data = getOrCreateDefaultDisplayObjectRenderNode(state, obj);
    data.visible = true;
    data.alpha = 1;
    data.transform2D.a = 0;
    data.transform2D.d = 0;
    buildRenderCommands(state, obj);
    expect(state.commandPool.commandCount).toBe(0);
  });

  it('emits a single DrawNode for a visible object', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const data = makeVisibleNode(state, obj);
    buildRenderCommands(state, obj);
    const cmds = commands(state);
    expect(cmds).toHaveLength(1);
    expect(cmds[0].kind).toBe(RenderCommandKind.DrawNode);
    expect(cmds[0].node).toBe(data);
  });

  it('emits DrawNode for parent then child in order', () => {
    const state = createRenderState();
    const parent = createDisplayObject();
    const child = createDisplayObject();
    addSceneChild(parent, child);
    const parentData = makeVisibleNode(state, parent);
    const childData = makeVisibleNode(state, child);
    buildRenderCommands(state, parent);
    const cmds = commands(state);
    expect(cmds).toHaveLength(2);
    expect(cmds[0].kind).toBe(RenderCommandKind.DrawNode);
    expect(cmds[0].node).toBe(parentData);
    expect(cmds[1].kind).toBe(RenderCommandKind.DrawNode);
    expect(cmds[1].node).toBe(childData);
  });

  it('resets the pool on each call', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    makeVisibleNode(state, obj);
    buildRenderCommands(state, obj);
    expect(state.commandPool.commandCount).toBe(1);
    buildRenderCommands(state, obj);
    expect(state.commandPool.commandCount).toBe(1);
  });

  it('respects updateChildren=false from an adapter', () => {
    const state = createRenderState();
    const parent = createDisplayObject();
    const child = createDisplayObject();
    addSceneChild(parent, child);
    const parentData = makeVisibleNode(state, parent);
    makeVisibleNode(state, child);
    parentData.updateChildren = false;
    buildRenderCommands(state, parent);
    expect(state.commandPool.commandCount).toBe(1);
    expect(commands(state)[0].node).toBe(parentData);
  });

  describe('masks', () => {
    it('excludes mask objects from DrawNode commands', () => {
      const state = createRenderState();
      enableRenderFeatures(state, RenderFeatures.Masks);
      const obj = createDisplayObject();
      makeVisibleNode(state, obj);
      const maskObj = createDisplayObject();
      makeVisibleNode(state, maskObj);
      obj.mask = maskObj;
      updateDisplayObjectBeforeRender(state, obj);
      buildRenderCommands(state, obj);
      const maskData = getOrCreateDefaultDisplayObjectRenderNode(state, maskObj);
      const drawNodes = commands(state).filter((c) => c.kind === RenderCommandKind.DrawNode);
      expect(drawNodes.every((c) => c.node !== maskData)).toBe(true);
    });

    it('emits PushMask, DrawNode, PopMask for a masked object with no children', () => {
      const state = createRenderState();
      enableRenderFeatures(state, RenderFeatures.Masks);
      const obj = createDisplayObject();
      const maskObj = createDisplayObject();
      obj.mask = maskObj;
      makeVisibleNode(state, obj);
      makeVisibleNode(state, maskObj);
      updateDisplayObjectBeforeRender(state, obj);
      buildRenderCommands(state, obj);
      const cmds = commands(state);
      expect(cmds.map((c) => c.kind)).toEqual([
        RenderCommandKind.PushMask,
        RenderCommandKind.DrawNode,
        RenderCommandKind.PopMask,
      ]);
    });

    it('wraps children between PushMask and PopMask', () => {
      const state = createRenderState();
      enableRenderFeatures(state, RenderFeatures.Masks);
      const parent = createDisplayObject();
      const child = createDisplayObject();
      const maskObj = createDisplayObject();
      addSceneChild(parent, child);
      parent.mask = maskObj;
      makeVisibleNode(state, parent);
      makeVisibleNode(state, child);
      makeVisibleNode(state, maskObj);
      updateDisplayObjectBeforeRender(state, parent);
      buildRenderCommands(state, parent);
      const kinds = commands(state).map((c) => c.kind);
      expect(kinds).toEqual([
        RenderCommandKind.PushMask,
        RenderCommandKind.DrawNode,
        RenderCommandKind.DrawNode,
        RenderCommandKind.PopMask,
      ]);
    });

    it('correctly nests PushMask/PopMask for siblings each with their own mask', () => {
      const state = createRenderState();
      enableRenderFeatures(state, RenderFeatures.Masks);

      const root = createDisplayObject();
      const childA = createDisplayObject();
      const childB = createDisplayObject();
      const maskA = createDisplayObject();
      const maskB = createDisplayObject();

      addSceneChild(root, childA);
      addSceneChild(root, childB);
      childA.mask = maskA;
      childB.mask = maskB;

      makeVisibleNode(state, root);
      makeVisibleNode(state, childA);
      makeVisibleNode(state, childB);
      makeVisibleNode(state, maskA);
      makeVisibleNode(state, maskB);
      updateDisplayObjectBeforeRender(state, root);
      buildRenderCommands(state, root);

      const kinds = commands(state).map((c) => c.kind);
      expect(kinds).toEqual([
        RenderCommandKind.DrawNode, // root
        RenderCommandKind.PushMask, // childA's mask
        RenderCommandKind.DrawNode, // childA
        RenderCommandKind.PopMask,
        RenderCommandKind.PushMask, // childB's mask
        RenderCommandKind.DrawNode, // childB
        RenderCommandKind.PopMask,
      ]);
    });
  });

  describe('scroll rectangles', () => {
    it('does not emit scroll rect commands when feature is disabled', () => {
      const state = createRenderState();
      const parent = createDisplayObject();
      const child = createDisplayObject();
      addSceneChild(parent, child);
      const parentData = makeVisibleNode(state, parent);
      makeVisibleNode(state, child);
      parentData.scrollRectangleDepth = 1;
      parent.scrollRectangle = createRectangle(0, 0, 100, 100);
      buildRenderCommands(state, parent);
      const kinds = commands(state).map((c) => c.kind);
      expect(kinds).not.toContain(RenderCommandKind.PushScrollRect);
    });

    it('emits PushScrollRect around children and PopScrollRect after', () => {
      const state = createRenderState();
      enableRenderFeatures(state, RenderFeatures.ScrollRectangle);
      const parent = createDisplayObject();
      const child = createDisplayObject();
      addSceneChild(parent, child);
      parent.scrollRectangle = createRectangle(0, 0, 100, 100);
      makeVisibleNode(state, parent);
      makeVisibleNode(state, child);
      buildRenderCommands(state, parent);
      const kinds = commands(state).map((c) => c.kind);
      expect(kinds).toEqual([
        RenderCommandKind.DrawNode, // parent
        RenderCommandKind.PushScrollRect,
        RenderCommandKind.DrawNode, // child
        RenderCommandKind.PopScrollRect,
      ]);
    });

    it('does not emit scroll rect commands when node has no children', () => {
      const state = createRenderState();
      enableRenderFeatures(state, RenderFeatures.ScrollRectangle);
      const obj = createDisplayObject();
      obj.scrollRectangle = createRectangle(0, 0, 100, 100);
      makeVisibleNode(state, obj);
      buildRenderCommands(state, obj);
      const kinds = commands(state).map((c) => c.kind);
      expect(kinds).toEqual([RenderCommandKind.DrawNode]);
    });

    it('orders PopScrollRect before PopMask when both are active', () => {
      const state = createRenderState();
      enableRenderFeatures(state, RenderFeatures.Masks | RenderFeatures.ScrollRectangle);
      const parent = createDisplayObject();
      const child = createDisplayObject();
      const maskObj = createDisplayObject();
      addSceneChild(parent, child);
      parent.mask = maskObj;
      parent.scrollRectangle = createRectangle(0, 0, 100, 100);
      makeVisibleNode(state, parent);
      makeVisibleNode(state, child);
      makeVisibleNode(state, maskObj);
      updateDisplayObjectBeforeRender(state, parent);
      buildRenderCommands(state, parent);
      const kinds = commands(state).map((c) => c.kind);
      expect(kinds).toEqual([
        RenderCommandKind.PushMask,
        RenderCommandKind.DrawNode, // parent
        RenderCommandKind.PushScrollRect,
        RenderCommandKind.DrawNode, // child
        RenderCommandKind.PopScrollRect,
        RenderCommandKind.PopMask,
      ]);
    });
  });
});

describe('executeRenderCommands', () => {
  it('dispatches command kinds to renderers and hooks', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const node = makeVisibleNode(state, obj);
    const draw = vi.fn();
    const pushMask = vi.fn();
    const popMask = vi.fn();
    const pushScrollRectangle = vi.fn();
    const popScrollRectangle = vi.fn();

    node.renderer = {
      createData: () => null,
      draw,
    };
    state.displayObjectMaskHooks = {
      popMask,
      pushMask,
    };
    state.scrollRectangleHooks = {
      pop: popScrollRectangle,
      push: pushScrollRectangle,
    };

    acquireRenderCommand(state.commandPool, RenderCommandKind.DrawNode, node);
    acquireRenderCommand(state.commandPool, RenderCommandKind.PushMask, node);
    acquireRenderCommand(state.commandPool, RenderCommandKind.PopMask, node);
    acquireRenderCommand(state.commandPool, RenderCommandKind.PushScrollRect, node);
    acquireRenderCommand(state.commandPool, RenderCommandKind.PopScrollRect, node);

    executeRenderCommands(state);

    expect(draw).toHaveBeenCalledWith(state, node);
    expect(pushMask).toHaveBeenCalledWith(state, node);
    expect(popMask).toHaveBeenCalledWith(state, node);
    expect(pushScrollRectangle).toHaveBeenCalledWith(state, node);
    expect(popScrollRectangle).toHaveBeenCalledWith(state);
  });
});
