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
  type RenderProxy,
  type RenderProxy2D,
  type RenderState,
} from '@flighthq/types';

import { updateRenderProxyAppearance } from './appearance';
import type { RenderProxyStateInternal } from './internal';
import { updateRenderProxyMaterial } from './material';
import { updateRenderProxy2DTransform } from './transform2d';

type AdaptHook = (state: RenderState, source: Renderable, data: RenderProxy2D) => void;
let _adaptHook: AdaptHook | null = null;
export function beginRenderProxyUpdate(_source: Renderable, _data: RenderProxy): void {}

// Per-node update callback for the render walks. Receives the source node and its render node plus
// the parent's render node; composes the trait update* steps (appearance, transform, material, clip).
export type RenderProxyVisitor = (
  state: RenderState,
  source: Renderable,
  data: RenderProxy2D,
  parentData: RenderProxy2D | undefined,
) => void;

export function createRenderProxy(state: RenderState, source: Renderable): RenderProxy {
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
// RenderProxy2D — there is no per-family render identity. What differs between them is the traits
// their source carries (display objects add clip + mask), not the render node type.
export function createRenderProxy2D(
  state: RenderState,
  source: Renderable & HasTransform2D & HasBoundsRectangle,
): RenderProxy2D {
  const node = createRenderProxy(state, source) as RenderProxy2D;
  node.transform2D = createMatrix();
  node.traverseChildren = true;
  node.isMaskFrameID = -1;
  node.maskDepth = 0;
  node.clipRectangleDepth = 0;
  return node;
}

export function getOrCreateRenderProxy2D(state: RenderState, source: Renderable): RenderProxy2D {
  const renderProxyMap = state.renderProxyMap;
  let node = renderProxyMap.get(source) as RenderProxy2D | undefined;
  if (!node) {
    node = createRenderProxy2D(state, source as Renderable & HasTransform2D & HasBoundsRectangle);
    renderProxyMap.set(source, node);
  }
  if (node.rendererMapID !== state.rendererMapID) {
    updateRenderProxyRenderer(state, node);
  }
  return node;
}

export function getRenderProxy2D(state: RenderState, source: Renderable): RenderProxy2D | undefined {
  return state.renderProxyMap.get(source) as RenderProxy2D | undefined;
}

export function installRenderAdaptHook(fn: AdaptHook): void {
  _adaptHook = fn;
}

export function isRenderProxyDirty(
  state: RenderState,
  source: Renderable,
  data: RenderProxy,
  parentData?: RenderProxy,
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

export function isRenderProxyVisible(data: RenderProxy2D): boolean {
  return data.visible && data.alpha > 0 && !(data.transform2D.a === 0 && data.transform2D.d === 0);
}

export function prepareDisplayObjectRender(state: RenderState, source: DisplayObject): boolean {
  const dirty = walkNode(state, source, updateRenderProxy2D);
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

  let parentData: RenderProxy2D | undefined = undefined;
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
        parentData = getOrCreateRenderProxy2D(state, parent as DisplayObject);
        lastParent = parent as DisplayObject;
      }
    }

    const data = getOrCreateRenderProxy2D(state, current);
    const parentMaskDepth = parentData !== undefined ? parentData.maskDepth : 0;

    const mask = current.mask;
    if (mask !== null) {
      const maskParent = getNodeParent(mask);
      const maskParentData =
        maskParent !== null ? getOrCreateRenderProxy2D(state, maskParent as DisplayObject) : undefined;
      const maskData = getOrCreateRenderProxy2D(state, mask);
      if (isRenderProxyDirty(state, mask, maskData, maskParentData)) {
        updateRenderProxyAppearance(state, maskData, maskParentData);
        updateRenderProxy2DTransform(state, maskData, maskParentData);
        updateRenderProxyMaterial(state, maskData, maskParentData);
        _adaptHook?.(state, mask, maskData);
      }
      maskData.isMaskFrameID = frameID;
      maskData.maskDepth = parentMaskDepth;
      data.maskDepth = parentMaskDepth + 1;
    } else {
      data.maskDepth = parentMaskDepth;
    }

    if (data.isMaskFrameID === frameID) continue;

    if (!isRenderProxyVisible(data)) continue;

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
  return walkNode(state, source, updateRenderProxy2D);
}

// Sets a node's clip-rectangle nesting depth from its parent. Stateless (derived from the parent's
// depth), so it composes as a trait update step. Nodes without the clip-rectangle trait (sprites)
// carry no clipRectangle field and contribute no depth, so the same step is safe in every walk.
export function updateNodeClipRectangle(
  _state: RenderState,
  source: Renderable,
  data: RenderProxy2D,
  parentData: RenderProxy2D | undefined,
): void {
  const parentDepth = parentData !== undefined ? parentData.clipRectangleDepth : 0;
  data.clipRectangleDepth = parentDepth + ((source as DisplayObject).clipRectangle != null ? 1 : 0);
}

// The one per-node update step for the 2D walk: appearance, transform, material, then the
// clip-rectangle trait (a no-op for nodes that lack it). Masks are not handled here — they are the
// separate prepareMasks pass. Sprites and display objects share this single visitor.
export function updateRenderProxy2D(
  state: RenderState,
  source: Renderable,
  data: RenderProxy2D,
  parentData: RenderProxy2D | undefined,
): void {
  updateRenderProxyAppearance(state, data, parentData);
  updateRenderProxy2DTransform(state, data, parentData);
  updateRenderProxyMaterial(state, data, parentData);
  updateNodeClipRectangle(state, source, data, parentData);
  _adaptHook?.(state, source, data);
}

export function updateRenderProxyRenderer(state: RenderState, node: RenderProxy): void {
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
export function walkNode(state: RenderState, root: Renderable, visit: RenderProxyVisitor): boolean {
  ++(state as RenderProxyStateInternal).currentFrameID;

  const tempStack = state.tempStack;
  let stackLength = 1;
  tempStack[0] = root;

  let parentData: RenderProxy2D | undefined = undefined;
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
        parentData = getOrCreateRenderProxy2D(state, parent as unknown as Renderable);
        lastParent = parent;
      }
    }

    const data = getOrCreateRenderProxy2D(state, current);

    if (isRenderProxyDirty(state, current, data, parentData)) {
      visit(state, current, data, parentData);
      treeDirty = true;
    }

    if (!isRenderProxyVisible(data)) continue;

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
