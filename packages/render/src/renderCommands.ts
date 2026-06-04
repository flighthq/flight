import { getDisplayObjectRuntime } from '@flighthq/scene-display';
import { getSpriteNodeRuntime } from '@flighthq/scene-sprite';
import type {
  DisplayObject,
  DisplayObjectRenderNode,
  RenderCommandPool,
  RenderNode2D,
  RenderState,
  SpriteNode,
} from '@flighthq/types';
import { RenderCommandKind, RenderFeatures } from '@flighthq/types';

import { acquireRenderCommand, resetRenderCommandPool } from './renderCommandPool';
import { hasRenderFeatures } from './renderer';
import { getOrCreateDisplayObjectRenderNode, getOrCreateSpriteRenderNode } from './renderNode2d';

/**
 * Builds the render command list for a display object tree.
 *
 * Resets the command pool, then performs a single DFS, emitting DrawNode,
 * PushMask/PopMask, and PushScrollRect/PopScrollRect commands in draw order.
 */
export function buildRenderCommands(state: RenderState, source: DisplayObject): void {
  const pool = state.commandPool;
  resetRenderCommandPool(pool);

  const tempStack = state.tempStack;
  const currentFrameID = state.currentFrameID;
  const hasMasks = hasRenderFeatures(state, RenderFeatures.Masks);
  const hasScrollRects = hasRenderFeatures(state, RenderFeatures.ScrollRectangle);

  let stackLength = 1;
  tempStack[0] = source;

  const pendingPops: PopAction[] = [];

  while (stackLength > 0) {
    const current = tempStack[--stackLength] as DisplayObject;

    if (!current.enabled) {
      drainPops(pool, pendingPops, stackLength);
      continue;
    }

    const data = getOrCreateDisplayObjectRenderNode(state, current);
    const isMaskObject = hasMasks && data.isMaskFrameID === currentFrameID;

    if (!isMaskObject) {
      const shouldRender = data.visible && data.alpha > 0 && !(data.transform2D.a === 0 && data.transform2D.d === 0);

      if (shouldRender) {
        let maskData: DisplayObjectRenderNode | null = null;
        if (hasMasks && current.mask !== null) {
          maskData = getOrCreateDisplayObjectRenderNode(state, current.mask);
          acquireRenderCommand(pool, RenderCommandKind.PushMask, maskData);
        }

        acquireRenderCommand(pool, RenderCommandKind.DrawNode, data);

        const prePushLength = stackLength;

        if (data.updateChildren) {
          const children = getDisplayObjectRuntime(current).children;
          if (children !== null) {
            for (let i = children.length - 1; i >= 0; i--) {
              tempStack[stackLength++] = children[i] as DisplayObject;
            }
          }
        }

        // PopMask defers until after all children; fires immediately if none were pushed.
        if (maskData !== null) {
          pendingPops.push({
            atStackLength: prePushLength,
            kind: RenderCommandKind.PopMask,
            node: maskData,
          });
        }

        // ScrollRect wraps children only - skip if none were pushed.
        // Pushed after PopMask so it fires (pops) before PopMask (LIFO).
        if (hasScrollRects && current.scrollRectangle !== null && stackLength > prePushLength) {
          acquireRenderCommand(pool, RenderCommandKind.PushScrollRect, data);
          pendingPops.push({
            atStackLength: prePushLength,
            kind: RenderCommandKind.PopScrollRect,
            node: data,
          });
        }
      }
    }

    drainPops(pool, pendingPops, stackLength);
  }

  // Safety drain - should not occur in valid, fully-connected trees.
  for (let i = pendingPops.length - 1; i >= 0; i--) {
    const pop = pendingPops[i];
    acquireRenderCommand(pool, pop.kind, pop.node);
  }
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

export function renderDisplayObjectTree(state: RenderState, source: DisplayObject): void {
  const tempStack = state.tempStack;
  const currentFrameID = state.currentFrameID;
  const hasMasks = hasRenderFeatures(state, RenderFeatures.Masks);
  const hasScrollRects = hasRenderFeatures(state, RenderFeatures.ScrollRectangle);

  let stackLength = 1;
  tempStack[0] = source;

  const pendingPops: RenderPopAction[] = [];

  while (stackLength > 0) {
    const current = tempStack[--stackLength] as DisplayObject;

    if (!current.enabled) {
      drainRenderPops(state, pendingPops, stackLength);
      continue;
    }

    const data = getOrCreateDisplayObjectRenderNode(state, current);
    const isMaskObject = hasMasks && data.isMaskFrameID === currentFrameID;

    if (!isMaskObject) {
      const shouldRender = data.visible && data.alpha > 0 && !(data.transform2D.a === 0 && data.transform2D.d === 0);

      if (shouldRender) {
        let maskData: DisplayObjectRenderNode | null = null;
        if (hasMasks && current.mask !== null) {
          maskData = getOrCreateDisplayObjectRenderNode(state, current.mask);
          state.displayObjectMaskHooks?.pushMask(state, maskData);
        }

        if (data.renderer !== null) data.renderer.draw(state, data);

        const prePushLength = stackLength;

        if (data.updateChildren) {
          const children = getDisplayObjectRuntime(current).children;
          if (children !== null) {
            for (let i = children.length - 1; i >= 0; i--) {
              tempStack[stackLength++] = children[i] as DisplayObject;
            }
          }
        }

        if (maskData !== null) {
          pendingPops.push({
            atStackLength: prePushLength,
            node: maskData,
          });
        }

        if (hasScrollRects && current.scrollRectangle !== null && stackLength > prePushLength) {
          state.scrollRectangleHooks?.push(state, data);
          pendingPops.push({
            atStackLength: prePushLength,
            node: null,
          });
        }
      }
    }

    drainRenderPops(state, pendingPops, stackLength);
  }

  for (let i = pendingPops.length - 1; i >= 0; i--) {
    const node = pendingPops[i].node;
    if (node === null) {
      state.scrollRectangleHooks?.pop(state);
    } else {
      state.displayObjectMaskHooks?.popMask(state, node);
    }
  }
}

export function renderSpriteTree(state: RenderState, source: SpriteNode): void {
  const tempStack = state.tempStack;
  let stackLength = 1;

  tempStack[0] = source;

  while (stackLength > 0) {
    const current = tempStack[--stackLength] as SpriteNode;
    const data = getOrCreateSpriteRenderNode(state, current);

    const shouldRender = data.visible && data.alpha > 0 && !(data.transform2D.a === 0 && data.transform2D.d === 0);
    if (!shouldRender) continue;

    if (data.renderer !== null) data.renderer.draw(state, data);

    if (data.updateChildren) {
      const children = getSpriteNodeRuntime(current).children;
      if (children !== null) {
        for (let i = children.length - 1; i >= 0; i--) {
          tempStack[stackLength++] = children[i] as SpriteNode;
        }
      }
    }
  }
}

interface PopAction {
  atStackLength: number;
  kind: RenderCommandKind;
  node: RenderNode2D;
}

interface RenderPopAction {
  atStackLength: number;
  node: DisplayObjectRenderNode | null;
}

function drainPops(pool: RenderCommandPool, pendingPops: PopAction[], stackLength: number): void {
  while (pendingPops.length > 0) {
    const top = pendingPops[pendingPops.length - 1];
    if (top.atStackLength < stackLength) break;
    pendingPops.pop();
    acquireRenderCommand(pool, top.kind, top.node);
  }
}

function drainRenderPops(state: RenderState, pendingPops: RenderPopAction[], stackLength: number): void {
  while (pendingPops.length > 0) {
    const top = pendingPops[pendingPops.length - 1];
    if (top.atStackLength < stackLength) break;
    pendingPops.pop();
    if (top.node === null) {
      state.scrollRectangleHooks?.pop(state);
    } else {
      state.displayObjectMaskHooks?.popMask(state, top.node);
    }
  }
}
