import type { RenderCommand, RenderCommandPool, RenderNode2D } from '@flighthq/types';

export function acquireRenderCommand(pool: RenderCommandPool, kind: number, node: RenderNode2D): RenderCommand {
  const index = pool.commandCount++;
  const cmd = pool.commands[index] ?? { kind, node };
  cmd.kind = kind;
  cmd.node = node;
  pool.commands[index] = cmd;
  return cmd;
}

export function createRenderCommandPool(): RenderCommandPool {
  const pool: RenderCommandPool = {
    commands: [],
    commandCount: 0,
  };
  return pool;
}

export function resetRenderCommandPool(pool: RenderCommandPool): void {
  pool.commandCount = 0;
}
