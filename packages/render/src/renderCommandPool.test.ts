import { createDisplayObject } from '@flighthq/scene-display';
import { RenderCommandKind } from '@flighthq/types';

import {
  acquireRenderCommand,
  createRenderCommandPool,
  executeRenderCommands,
  resetRenderCommandPool,
} from './renderCommandPool';
import { getOrCreateDisplayObjectRenderNode } from './renderNode';
import { createRenderState } from './renderState';

function makeNode() {
  return {} as any;
}

describe('acquireRenderCommand', () => {
  it('allocates a new command when the pool is empty', () => {
    const pool = createRenderCommandPool();
    const node = makeNode();
    const cmd = acquireRenderCommand(pool, RenderCommandKind.DrawNode, node);
    expect(cmd).toBeDefined();
    expect(cmd.kind).toBe(RenderCommandKind.DrawNode);
    expect(cmd.node).toBe(node);
  });

  it('adds the command to the commands array', () => {
    const pool = createRenderCommandPool();
    const node = makeNode();
    const cmd = acquireRenderCommand(pool, RenderCommandKind.DrawNode, node);
    expect(pool.commands[0]).toBe(cmd);
    expect(pool.commandCount).toBe(1);
  });

  it('increments commandCount with each acquire', () => {
    const pool = createRenderCommandPool();
    acquireRenderCommand(pool, RenderCommandKind.DrawNode, makeNode());
    acquireRenderCommand(pool, RenderCommandKind.PushMask, makeNode());
    acquireRenderCommand(pool, RenderCommandKind.PopMask, makeNode());
    expect(pool.commandCount).toBe(3);
  });

  it('reuses a command after reset', () => {
    const pool = createRenderCommandPool();
    const node = makeNode();
    const original = acquireRenderCommand(pool, RenderCommandKind.DrawNode, node);
    resetRenderCommandPool(pool);
    const reused = acquireRenderCommand(pool, RenderCommandKind.PushMask, node);
    expect(reused).toBe(original);
  });

  it('sets kind and node correctly on each acquired command', () => {
    const pool = createRenderCommandPool();
    const nodeA = makeNode();
    const nodeB = makeNode();
    const cmdA = acquireRenderCommand(pool, RenderCommandKind.PushMask, nodeA);
    const cmdB = acquireRenderCommand(pool, RenderCommandKind.PopMask, nodeB);
    expect(cmdA.kind).toBe(RenderCommandKind.PushMask);
    expect(cmdA.node).toBe(nodeA);
    expect(cmdB.kind).toBe(RenderCommandKind.PopMask);
    expect(cmdB.node).toBe(nodeB);
  });

  it('updates kind and node on a reused command', () => {
    const pool = createRenderCommandPool();
    acquireRenderCommand(pool, RenderCommandKind.DrawNode, makeNode());
    resetRenderCommandPool(pool);
    const nodeB = makeNode();
    const cmd = acquireRenderCommand(pool, RenderCommandKind.PushScrollRect, nodeB);
    expect(cmd.kind).toBe(RenderCommandKind.PushScrollRect);
    expect(cmd.node).toBe(nodeB);
  });
});

describe('createRenderCommandPool', () => {
  it('initializes with empty commands and zero count', () => {
    const pool = createRenderCommandPool();
    expect(pool.commands).toEqual([]);
    expect(pool.commandCount).toBe(0);
  });
});

describe('executeRenderCommands', () => {
  it('dispatches command kinds to renderers and hooks', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const node = getOrCreateDisplayObjectRenderNode(state, obj);
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

describe('resetRenderCommandPool', () => {
  it('does not allocate new objects across acquire-reset cycles', () => {
    const pool = createRenderCommandPool();
    acquireRenderCommand(pool, RenderCommandKind.DrawNode, makeNode());
    acquireRenderCommand(pool, RenderCommandKind.DrawNode, makeNode());
    resetRenderCommandPool(pool);
    const firstBatch = [
      acquireRenderCommand(pool, RenderCommandKind.DrawNode, makeNode()),
      acquireRenderCommand(pool, RenderCommandKind.DrawNode, makeNode()),
    ];
    resetRenderCommandPool(pool);
    const secondBatch = [
      acquireRenderCommand(pool, RenderCommandKind.DrawNode, makeNode()),
      acquireRenderCommand(pool, RenderCommandKind.DrawNode, makeNode()),
    ];
    const firstSet = new Set(firstBatch);
    expect(secondBatch.every((cmd) => firstSet.has(cmd))).toBe(true);
  });

  it('is safe to call on an empty pool', () => {
    const pool = createRenderCommandPool();
    expect(() => resetRenderCommandPool(pool)).not.toThrow();
    expect(pool.commandCount).toBe(0);
  });

  it('sets commandCount to zero', () => {
    const pool = createRenderCommandPool();
    acquireRenderCommand(pool, RenderCommandKind.DrawNode, makeNode());
    acquireRenderCommand(pool, RenderCommandKind.DrawNode, makeNode());
    resetRenderCommandPool(pool);
    expect(pool.commandCount).toBe(0);
  });
});
