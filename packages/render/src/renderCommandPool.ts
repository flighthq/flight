import type {
  DisplayObjectRenderNode,
  RenderCommand,
  RenderCommandPool,
  RenderNode2D,
  RenderState,
} from '@flighthq/types';
import { RenderCommandKind } from '@flighthq/types';

export function acquireRenderCommand(pool: RenderCommandPool, kind: number, node: RenderNode2D): RenderCommand {
  const index = pool.commandCount++;
  const cmd = pool.commands[index] ?? { kind, node };
  cmd.kind = kind;
  cmd.node = node;
  pool.commands[index] = cmd;
  return cmd;
}

export function createRenderCommandPool(): RenderCommandPool {
  return {
    commands: [],
    commandCount: 0,
  };
}

export function executeRenderCommands(state: RenderState): void {
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

export function resetRenderCommandPool(pool: RenderCommandPool): void {
  pool.commandCount = 0;
}
