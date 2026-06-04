import {
  acquireRenderCommand,
  adaptRenderNode,
  beginFrame,
  beginRenderNodeUpdate,
  executeRenderCommands,
  getOrCreateDisplayObjectRenderNode,
  getOrCreateSpriteRenderNode,
  hasRenderFeatures,
  isRenderNodeDirty,
  isRenderNodeVisible,
  resetRenderCommandPool,
  updateDisplayObjectRenderTransform,
  updateRenderNode2DTransform,
  updateRenderNodeAppearance,
} from '@flighthq/render';
import { getSceneParent } from '@flighthq/scene';
import { getDisplayObjectRuntime } from '@flighthq/scene-display';
import { getSpriteNodeRuntime } from '@flighthq/scene-sprite';
import type {
  CanvasRenderState,
  DisplayObject,
  DisplayObjectRenderNode,
  RenderCommandPool,
  RenderNode2D,
  SpriteNode,
  SpriteRenderNode,
} from '@flighthq/types';
import { RenderCommandKind, RenderFeatures } from '@flighthq/types';

export function prepareCanvasDisplayObjectRender(state: CanvasRenderState, source: DisplayObject): boolean {
  const frameID = beginFrame(state);
  const pool = state.commandPool;
  resetRenderCommandPool(pool);

  const tempStack = state.tempStack;
  const hasMasks = hasRenderFeatures(state, RenderFeatures.Masks);
  const hasScrollRects = hasRenderFeatures(state, RenderFeatures.ScrollRectangle);

  let stackLength = 1;
  tempStack[0] = source;

  let parentData: DisplayObjectRenderNode | undefined = undefined;
  let lastParent: DisplayObject | null = null;
  let scrollRectangleDepth = 0;
  let maskDepth = 0;
  let treeDirty = false;

  const pendingPops: PendingPop[] = [];

  while (stackLength > 0) {
    const current = tempStack[--stackLength] as DisplayObject;

    if (!current.enabled) {
      drainPops(pool, pendingPops, stackLength);
      continue;
    }

    if (current !== source) {
      const parent = getSceneParent(current);
      if (parent === null) {
        parentData = undefined;
        lastParent = null;
        scrollRectangleDepth = 0;
        maskDepth = 0;
      } else if (parent !== lastParent) {
        parentData = getOrCreateDisplayObjectRenderNode(state, parent as DisplayObject);
        lastParent = parent as DisplayObject;
        scrollRectangleDepth = hasScrollRects ? parentData.scrollRectangleDepth : 0;
        maskDepth = hasMasks ? parentData.maskDepth : 0;
      }
    }

    const data = getOrCreateDisplayObjectRenderNode(state, current);

    if (isRenderNodeDirty(state, current, data, parentData)) {
      beginRenderNodeUpdate(current, data);
      updateRenderNodeAppearance(state, data, parentData);
      updateDisplayObjectRenderTransform(state, data, parentData);
      adaptRenderNode(state, current, data);
      treeDirty = true;
    }

    if (hasScrollRects && current.scrollRectangle !== null) {
      data.scrollRectangleDepth = ++scrollRectangleDepth;
    } else {
      data.scrollRectangleDepth = scrollRectangleDepth;
    }

    const mask = current.mask;
    if (hasMasks && mask !== null) {
      const maskData = getOrCreateDisplayObjectRenderNode(state, mask);
      maskData.isMaskFrameID = frameID;
      maskData.scrollRectangleDepth = 0;
      maskData.maskDepth = 0;
      tempStack[stackLength++] = mask;
      data.maskDepth = ++maskDepth;
    } else {
      data.maskDepth = maskDepth;
    }

    if (hasMasks && data.isMaskFrameID === frameID) {
      drainPops(pool, pendingPops, stackLength);
      continue;
    }

    if (!isRenderNodeVisible(data)) {
      drainPops(pool, pendingPops, stackLength);
      continue;
    }

    let maskCommandData: DisplayObjectRenderNode | null = null;
    if (hasMasks && mask !== null) {
      maskCommandData = getOrCreateDisplayObjectRenderNode(state, mask);
      acquireRenderCommand(pool, RenderCommandKind.PushMask, maskCommandData);
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

    if (maskCommandData !== null) {
      pendingPops.push({ atStackLength: prePushLength, kind: RenderCommandKind.PopMask, node: maskCommandData });
    }

    if (hasScrollRects && current.scrollRectangle !== null && stackLength > prePushLength) {
      acquireRenderCommand(pool, RenderCommandKind.PushScrollRect, data);
      pendingPops.push({ atStackLength: prePushLength, kind: RenderCommandKind.PopScrollRect, node: data });
    }

    drainPops(pool, pendingPops, stackLength);
  }

  for (let i = pendingPops.length - 1; i >= 0; i--) {
    const pop = pendingPops[i];
    acquireRenderCommand(pool, pop.kind, pop.node);
  }

  return treeDirty;
}

export function prepareCanvasSpriteRender(state: CanvasRenderState, source: SpriteNode): boolean {
  beginFrame(state);
  const pool = state.commandPool;
  resetRenderCommandPool(pool);

  const tempStack = state.tempStack;

  let stackLength = 1;
  tempStack[0] = source;

  let parentData: SpriteRenderNode | undefined = undefined;
  let lastParent: SpriteNode | null = null;
  let treeDirty = false;

  while (stackLength > 0) {
    const current = tempStack[--stackLength] as SpriteNode;

    if (!current.enabled) continue;

    if (current !== source) {
      const parent = getSceneParent(current);
      if (parent === null) {
        parentData = undefined;
        lastParent = null;
      } else if (parent !== lastParent) {
        parentData = getOrCreateSpriteRenderNode(state, parent as SpriteNode);
        lastParent = parent as SpriteNode;
      }
    }

    const data = getOrCreateSpriteRenderNode(state, current);

    if (isRenderNodeDirty(state, current, data, parentData)) {
      beginRenderNodeUpdate(current, data);
      updateRenderNodeAppearance(state, data, parentData);
      updateRenderNode2DTransform(state, data, parentData);
      adaptRenderNode(state, current, data);
      treeDirty = true;
    }

    if (!isRenderNodeVisible(data)) continue;

    acquireRenderCommand(pool, RenderCommandKind.DrawNode, data);

    if (data.updateChildren) {
      const children = getSpriteNodeRuntime(current).children;
      if (children !== null) {
        for (let i = children.length - 1; i >= 0; i--) {
          tempStack[stackLength++] = children[i] as SpriteNode;
        }
      }
    }
  }

  return treeDirty;
}

export function renderCanvas(state: CanvasRenderState): void {
  executeRenderCommands(state);
}

interface PendingPop {
  atStackLength: number;
  kind: RenderCommandKind;
  node: RenderNode2D;
}

function drainPops(pool: RenderCommandPool, pendingPops: PendingPop[], stackLength: number): void {
  while (pendingPops.length > 0) {
    const top = pendingPops[pendingPops.length - 1];
    if (top.atStackLength < stackLength) break;
    pendingPops.pop();
    acquireRenderCommand(pool, top.kind, top.node);
  }
}
