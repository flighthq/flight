import type { RenderCommand, RenderCommandPool, RenderNode2D } from '@flighthq/types';

import type { RenderCommandInternal, RenderCommandPoolInternal } from './renderCommandInternal';

export function acquireRenderCommand(pool: RenderCommandPool, kind: number, node: RenderNode2D): RenderCommand {
  const internal = pool as RenderCommandPoolInternal;
  let cmd: RenderCommandInternal;
  if (internal.freeHead !== null) {
    cmd = internal.freeHead;
    internal.freeHead = cmd.poolNext;
  } else {
    cmd = { kind, node, poolNext: null };
  }
  cmd.kind = kind;
  cmd.node = node;
  cmd.poolNext = null;
  internal.commands[internal.commandCount++] = cmd;
  return cmd;
}

export function createRenderCommandPool(): RenderCommandPool {
  const pool: RenderCommandPoolInternal = {
    commands: [],
    commandCount: 0,
    freeHead: null,
  };
  return pool;
}

export function resetRenderCommandPool(pool: RenderCommandPool): void {
  const internal = pool as RenderCommandPoolInternal;
  const count = internal.commandCount;
  const commands = internal.commands;
  for (let i = 0; i < count; i++) {
    const cmd = commands[i];
    cmd.poolNext = internal.freeHead;
    internal.freeHead = cmd;
  }
  internal.commandCount = 0;
}
