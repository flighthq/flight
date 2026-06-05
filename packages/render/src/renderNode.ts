import { createEntity } from '@flighthq/entity';
import { createMatrix } from '@flighthq/geometry';
import { createColorTransform } from '@flighthq/materials';
import { getSceneParent } from '@flighthq/scene';
import { getDisplayObjectRuntime } from '@flighthq/scene-display';
import { getSpriteNodeRuntime } from '@flighthq/scene-sprite';
import {
  BlendMode,
  type DisplayObject,
  type DisplayObjectRenderNode,
  type HasBoundsRect,
  type HasTransform2D,
  type Renderable,
  RenderFeatures,
  type RenderNode,
  type RenderNode2D,
  type RenderState,
  type SpriteNode,
  type SpriteRenderNode,
} from '@flighthq/types';

import { updateRenderNodeAppearance } from './appearance';
import type { RenderNodeStateInternal } from './internal';
import { hasRenderFeatures } from './renderer';
import { adaptRenderNode, isRenderNodeDirty } from './renderNodeAdapter';
import { updateDisplayObjectRenderTransform, updateRenderNode2DTransform } from './transform2d';

export function createDisplayObjectRenderNode(state: RenderState, source: DisplayObject): DisplayObjectRenderNode {
  const out = createRenderNode2D(state, source) as DisplayObjectRenderNode;
  out.isMaskFrameID = -1;
  out.maskDepth = 0;
  out.scrollRectangleDepth = 0;
  out.traverseChildren = true;
  return out;
}

export function createRenderNode(state: RenderState, source: Renderable): RenderNode {
  const renderer = state.rendererMap.get(source.kind) ?? null;
  return createEntity({
    source: source,
    kind: source.kind,
    resolver: null,
    next: null,
    alpha: 1,
    appearanceFrameID: -1,
    blendMode: BlendMode.Normal,
    colorTransform: createColorTransform(),
    lastAppearanceID: -1,
    lastLocalTransformID: -1,
    name: null,
    renderer: renderer,
    rendererData: renderer?.createData(state, source) ?? null,
    rendererDataSource: source,
    rendererMapID: state.rendererMapID,
    shader: null,
    transformFrameID: -1,
    useColorTransform: false,
    visible: true,
  });
}

export function createRenderNode2D(
  state: RenderState,
  source: Renderable & HasTransform2D & HasBoundsRect,
): RenderNode2D {
  const node = createRenderNode(state, source) as RenderNode2D;
  node.transform2D = createMatrix();
  return node;
}

export function createSpriteRenderNode(state: RenderState, source: SpriteNode): SpriteRenderNode {
  const out = createRenderNode2D(state, source) as SpriteRenderNode;
  out.traverseChildren = true;
  return out;
}

export function getDisplayObjectRenderNode(
  state: RenderState,
  source: DisplayObject,
): DisplayObjectRenderNode | undefined {
  return state.renderNodeMap.get(source) as DisplayObjectRenderNode | undefined;
}

export function getOrCreateDisplayObjectRenderNode(state: RenderState, source: DisplayObject): DisplayObjectRenderNode {
  return getOrCreateRenderNode(state, source, createDisplayObjectRenderNode);
}

export function getOrCreateRenderNode<Source extends Renderable, NodeType extends RenderNode>(
  state: RenderState,
  source: Source,
  createNode: (state: RenderState, src: Source) => NodeType,
): NodeType {
  const renderNodeMap = state.renderNodeMap;
  let node = renderNodeMap.get(source);
  if (!node) {
    node = createNode(state, source);
    renderNodeMap.set(source, node);
  }
  if (node.rendererMapID !== state.rendererMapID) {
    syncRenderNodeRenderer(state, node);
  }
  return node as NodeType;
}

export function getOrCreateSpriteRenderNode(state: RenderState, source: SpriteNode): SpriteRenderNode {
  return getOrCreateRenderNode(state, source, createSpriteRenderNode);
}

export function isRenderNodeVisible(data: RenderNode2D): boolean {
  return data.visible && data.alpha > 0 && !(data.transform2D.a === 0 && data.transform2D.d === 0);
}

export function prepareDisplayObjectRender(state: RenderState, source: DisplayObject): boolean {
  const frameID = ++(state as RenderNodeStateInternal).currentFrameID;

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

  while (stackLength > 0) {
    const current = tempStack[--stackLength] as DisplayObject;
    if (!current.enabled) continue;

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
      tempStack[stackLength++] = mask;
      data.maskDepth = ++maskDepth;
    } else {
      data.maskDepth = maskDepth;
    }

    if (hasMasks && data.isMaskFrameID === frameID) continue;

    if (!isRenderNodeVisible(data)) continue;

    if (data.traverseChildren) {
      const children = getDisplayObjectRuntime(current).children;
      if (children !== null) {
        for (let i = children.length - 1; i >= 0; i--) {
          tempStack[stackLength++] = children[i] as DisplayObject;
        }
      }
    }
  }

  return treeDirty;
}

export function prepareSpriteRender(state: RenderState, source: SpriteNode): boolean {
  ++(state as RenderNodeStateInternal).currentFrameID;

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
      updateRenderNodeAppearance(state, data, parentData);
      updateRenderNode2DTransform(state, data, parentData);
      adaptRenderNode(state, current, data);
      treeDirty = true;
    }

    if (!isRenderNodeVisible(data)) continue;

    if (data.traverseChildren) {
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

export function syncRenderNodeRenderer(state: RenderState, node: RenderNode): void {
  const renderer = state.rendererMap.get(node.kind) ?? null;
  if (node.renderer !== renderer || node.rendererDataSource !== node.source) {
    node.renderer = renderer;
    node.rendererData = renderer?.createData(state, node.source) ?? null;
    node.rendererDataSource = node.source;
  }
  node.rendererMapID = state.rendererMapID;
}
