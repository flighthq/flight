import { createEntity } from '@flighthq/entity';
import { createMatrix } from '@flighthq/geometry';
import {
  getNodeAppearanceRevision,
  getNodeLocalTransformRevision,
  getNodeParent,
  getNodeRuntime,
} from '@flighthq/node';
import {
  BlendMode,
  type DisplayObject,
  type HasBoundsRectangle,
  type HasTransform2D,
  type Node,
  type Renderable,
  type RenderNode,
  type RenderNode2D,
  type RenderState,
} from '@flighthq/types';

import { updateRenderNodeAppearance } from './appearance';
import type { RenderNodeStateInternal } from './internal';
import { updateRenderNodeMaterial } from './material';
import { updateRenderNode2DTransform } from './transform2d';

type AdaptHook = (state: RenderState, source: Renderable, data: RenderNode2D) => void;
let _adaptHook: AdaptHook | null = null;
export function beginRenderNodeUpdate(_source: Renderable, _data: RenderNode): void {}

// Per-node update callback for the render walks. Receives the source node and its render node plus
// the parent's render node; composes the trait update* steps (appearance, transform, material, clip).
export type RenderNodeVisitor = (
  state: RenderState,
  source: Renderable,
  data: RenderNode2D,
  parentData: RenderNode2D | undefined,
) => void;

export function createRenderNode(state: RenderState, source: Renderable): RenderNode {
  const renderer = state.rendererMap.get(source.kind) ?? null;
  return createEntity({
    source: source,
    kind: source.kind,
    next: null,
    alpha: 1,
    appearanceFrameID: -1,
    blendMode: BlendMode.Normal,
    material: null,
    materialData: null,
    lastAppearanceID: -1,
    lastLocalTransformID: -1,
    name: null,
    renderer: renderer,
    rendererData: renderer?.createData(state, source) ?? null,
    rendererDataSource: source,
    rendererMapID: state.rendererMapID,
    transformFrameID: -1,
    visible: true,
  });
}

// The one render-node allocator for the 2D graph. Sprites and display objects produce the same
// RenderNode2D — there is no per-family render identity. What differs between them is the traits
// their source carries (display objects add clip + mask), not the render node type.
export function createRenderNode2D(
  state: RenderState,
  source: Renderable & HasTransform2D & HasBoundsRectangle,
): RenderNode2D {
  const node = createRenderNode(state, source) as RenderNode2D;
  node.transform2D = createMatrix();
  node.traverseChildren = true;
  node.isMaskFrameID = -1;
  node.maskDepth = 0;
  node.clipRectangleDepth = 0;
  return node;
}

export function getOrCreateRenderNode2D(state: RenderState, source: Renderable): RenderNode2D {
  const renderNodeMap = state.renderNodeMap;
  let node = renderNodeMap.get(source) as RenderNode2D | undefined;
  if (!node) {
    node = createRenderNode2D(state, source as Renderable & HasTransform2D & HasBoundsRectangle);
    renderNodeMap.set(source, node);
  }
  if (node.rendererMapID !== state.rendererMapID) {
    updateRenderNodeRenderer(state, node);
  }
  return node;
}

export function getRenderNode2D(state: RenderState, source: Renderable): RenderNode2D | undefined {
  return state.renderNodeMap.get(source) as RenderNode2D | undefined;
}

export function installRenderAdaptHook(fn: AdaptHook): void {
  _adaptHook = fn;
}

export function isRenderNodeDirty(
  state: RenderState,
  source: Renderable,
  data: RenderNode,
  parentData?: RenderNode,
): boolean {
  const parentDirty =
    parentData !== undefined &&
    (parentData.transformFrameID === state.currentFrameID || parentData.appearanceFrameID === state.currentFrameID);
  const localDirty =
    state.sceneGraphSyncPolicy === 'refreshDerivedState' ||
    data.lastLocalTransformID !== getNodeLocalTransformRevision(source as Node) ||
    data.lastAppearanceID !== getNodeAppearanceRevision(source as Node);
  return parentDirty || localDirty;
}

export function isRenderNodeVisible(data: RenderNode2D): boolean {
  return data.visible && data.alpha > 0 && !(data.transform2D.a === 0 && data.transform2D.d === 0);
}

export function prepareDisplayObjectRender(state: RenderState, source: DisplayObject): boolean {
  const dirty = walkNode(state, source, updateRenderNode2D);
  prepareMasks(state, source);
  return dirty;
}

// Separate pass for the mask trait — only meaningful for display objects, and only worth running
// when masks are in use, which is exactly why it is its own pass rather than baked into the walk.
// Reuses the frame id from the preceding walk (does not advance it) so mask nodes are marked for the
// same frame the draw pass reads. Sets each node's mask nesting depth and resolves + marks the masks.
export function prepareMasks(state: RenderState, source: DisplayObject): void {
  const frameID = state.currentFrameID;

  const tempStack = state.tempStack;
  let stackLength = 1;
  tempStack[0] = source;

  let parentData: RenderNode2D | undefined = undefined;
  let lastParent: DisplayObject | null = null;

  while (stackLength > 0) {
    const current = tempStack[--stackLength] as DisplayObject;
    if (!current.enabled) continue;

    if (current !== source) {
      const parent = getNodeParent(current);
      if (parent === null) {
        parentData = undefined;
        lastParent = null;
      } else if (parent !== lastParent) {
        parentData = getOrCreateRenderNode2D(state, parent as DisplayObject);
        lastParent = parent as DisplayObject;
      }
    }

    const data = getOrCreateRenderNode2D(state, current);
    const parentMaskDepth = parentData !== undefined ? parentData.maskDepth : 0;

    const mask = current.mask;
    if (mask !== null) {
      const maskParent = getNodeParent(mask);
      const maskParentData =
        maskParent !== null ? getOrCreateRenderNode2D(state, maskParent as DisplayObject) : undefined;
      const maskData = getOrCreateRenderNode2D(state, mask);
      if (isRenderNodeDirty(state, mask, maskData, maskParentData)) {
        updateRenderNodeAppearance(state, maskData, maskParentData);
        updateRenderNode2DTransform(state, maskData, maskParentData);
        updateRenderNodeMaterial(state, maskData, maskParentData);
        _adaptHook?.(state, mask, maskData);
      }
      maskData.isMaskFrameID = frameID;
      maskData.maskDepth = parentMaskDepth;
      data.maskDepth = parentMaskDepth + 1;
    } else {
      data.maskDepth = parentMaskDepth;
    }

    if (data.isMaskFrameID === frameID) continue;

    if (!isRenderNodeVisible(data)) continue;

    if (data.traverseChildren) {
      const children = getNodeRuntime(current).children;
      if (children !== null) {
        for (let i = children.length - 1; i >= 0; i--) {
          tempStack[stackLength++] = children[i] as DisplayObject;
        }
      }
    }
  }
}

export function prepareSpriteRender(state: RenderState, source: Renderable): boolean {
  return walkNode(state, source, updateRenderNode2D);
}

// Sets a node's clip-rectangle nesting depth from its parent. Stateless (derived from the parent's
// depth), so it composes as a trait update step. Nodes without the clip-rectangle trait (sprites)
// carry no clipRectangle field and contribute no depth, so the same step is safe in every walk.
export function updateNodeClipRectangle(
  _state: RenderState,
  source: Renderable,
  data: RenderNode2D,
  parentData: RenderNode2D | undefined,
): void {
  const parentDepth = parentData !== undefined ? parentData.clipRectangleDepth : 0;
  data.clipRectangleDepth = parentDepth + ((source as DisplayObject).clipRectangle != null ? 1 : 0);
}

// The one per-node update step for the 2D walk: appearance, transform, material, then the
// clip-rectangle trait (a no-op for nodes that lack it). Masks are not handled here — they are the
// separate prepareMasks pass. Sprites and display objects share this single visitor.
export function updateRenderNode2D(
  state: RenderState,
  source: Renderable,
  data: RenderNode2D,
  parentData: RenderNode2D | undefined,
): void {
  updateRenderNodeAppearance(state, data, parentData);
  updateRenderNode2DTransform(state, data, parentData);
  updateRenderNodeMaterial(state, data, parentData);
  updateNodeClipRectangle(state, source, data, parentData);
  _adaptHook?.(state, source, data);
}

export function updateRenderNodeRenderer(state: RenderState, node: RenderNode): void {
  const renderer = state.rendererMap.get(node.kind) ?? null;
  if (node.renderer !== renderer || node.rendererDataSource !== node.source) {
    node.renderer = renderer;
    node.rendererData = renderer?.createData(state, node.source) ?? null;
    node.rendererDataSource = node.source;
  }
  node.rendererMapID = state.rendererMapID;
}

// One generic, dirty-checked pre-order walk over the 2D node graph. `visit` composes the trait
// update* steps. Sprites and display objects share this single traversal and a single render-node
// type — what differs is the traits they carry, not the path. Clip and mask are not handled here:
// clip is a trait update step in the visitor, masks are the separate prepareMasks pass.
export function walkNode(state: RenderState, root: Renderable, visit: RenderNodeVisitor): boolean {
  ++(state as RenderNodeStateInternal).currentFrameID;

  const tempStack = state.tempStack;
  let stackLength = 1;
  tempStack[0] = root;

  let parentData: RenderNode2D | undefined = undefined;
  let lastParent: Node | null = null;
  let treeDirty = false;

  while (stackLength > 0) {
    const current = tempStack[--stackLength] as Renderable;
    if (!(current as Node).enabled) continue;

    if (current !== root) {
      const parent = getNodeParent(current as Node);
      if (parent === null) {
        parentData = undefined;
        lastParent = null;
      } else if (parent !== lastParent) {
        parentData = getOrCreateRenderNode2D(state, parent as unknown as Renderable);
        lastParent = parent;
      }
    }

    const data = getOrCreateRenderNode2D(state, current);

    if (isRenderNodeDirty(state, current, data, parentData)) {
      visit(state, current, data, parentData);
      treeDirty = true;
    }

    if (!isRenderNodeVisible(data)) continue;

    if (data.traverseChildren) {
      const children = getNodeRuntime(current as Node).children;
      if (children !== null) {
        for (let i = children.length - 1; i >= 0; i--) {
          tempStack[stackLength++] = children[i] as unknown as Renderable;
        }
      }
    }
  }

  return treeDirty;
}
