import { getDisplayObjectRuntime } from '@flighthq/scene-display';
import type {
  DisplayObject,
  DisplayObjectRenderNode,
  RenderCommandPool,
  RenderNode2D,
  RenderState,
} from '@flighthq/types';
import { RenderCommandKind, RenderFeatures } from '@flighthq/types';

import { acquireRenderCommand, resetRenderCommandPool } from './renderCommandPool';
import { hasRenderFeatures } from './renderer';
import { getOrCreateDisplayObjectRenderNode } from './renderNode2d';

interface PopAction {
  kind: number;
  node: RenderNode2D;
  atStackLength: number;
}

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

  const popActions: PopAction[] = [];

  while (stackLength > 0) {
    const current = tempStack[--stackLength] as DisplayObject;

    if (!current.enabled) {
      drainPops(pool, popActions, stackLength);
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
          popActions.push({ kind: RenderCommandKind.PopMask, node: maskData, atStackLength: prePushLength });
        }

        // ScrollRect wraps children only — skip if none were pushed.
        if (hasScrollRects && current.scrollRectangle !== null && stackLength > prePushLength) {
          acquireRenderCommand(pool, RenderCommandKind.PushScrollRect, data);
          // PushScrollRect is scheduled AFTER PopMask so it fires (pops) BEFORE PopMask.
          popActions.push({ kind: RenderCommandKind.PopScrollRect, node: data, atStackLength: prePushLength });
        }
      }
    }

    drainPops(pool, popActions, stackLength);
  }

  // Safety drain — should not occur in valid, fully-connected trees.
  for (let i = popActions.length - 1; i >= 0; i--) {
    acquireRenderCommand(pool, popActions[i].kind, popActions[i].node);
  }
}

function drainPops(pool: RenderCommandPool, popActions: PopAction[], stackLength: number): void {
  while (popActions.length > 0 && popActions[popActions.length - 1].atStackLength >= stackLength) {
    const pop = popActions.pop()!;
    acquireRenderCommand(pool, pop.kind, pop.node);
  }
}
