import { createEntity } from '@flighthq/entity';
import { createMatrix } from '@flighthq/geometry';
import {
  getNodeAppearanceRevision,
  getNodeLocalContentRevision,
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
import { updateRenderProxyMaterial } from './material';
import { getRenderStateRuntime } from './renderState';
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
  const runtime = getRenderStateRuntime(state);
  const renderer = runtime.rendererMap.get(source.kind) ?? null;
  return createEntity({
    source: source,
    kind: source.kind,
    next: null,
    alpha: 1,
    appearanceFrameId: -1,
    blendMode: BlendMode.Normal,
    material: null,
    materialData: null,
    lastAppearanceId: -1,
    lastLocalContentId: -1,
    lastLocalTransformId: -1,
    name: null,
    renderer: renderer,
    rendererData: renderer?.createData(state, source) ?? null,
    rendererDataSource: source,
    rendererMapId: runtime.rendererMapId,
    transformFrameId: -1,
    visible: true,
  });
}

// The one render-node allocator for the 2D graph. Sprites and display objects produce the same
// RenderProxy2D — there is no per-family render identity. What differs between them is the traits
// their source carries (the clip trait), not the render node type.
export function createRenderProxy2D(
  state: RenderState,
  source: Renderable & HasTransform2D & HasBoundsRectangle,
): RenderProxy2D {
  const node = createRenderProxy(state, source) as RenderProxy2D;
  node.transform2D = createMatrix();
  node.traverseChildren = true;
  node.clipDepth = 0;
  return node;
}

// Teardown counterpart to prepareDisplayObjectRender: disposes the render of `root` and every descendant —
// the render proxies that prepareDisplayObjectRender created. Each disposeRenderProxy cascades to the
// renderer's destroyData, so the GPU textures/framebuffers are freed now while the proxies become
// GC-eligible. Sprites and display objects share one render proxy, so a single dispose serves both;
// there is no mask proxy to dispose separately (masks were retired into clips). Call after
// removeNodeChild for nodes that will never be rendered again. Unlike prepareDisplayObjectRender, this visits
// all nodes regardless of enabled or visible state.
export function disposeDisplayObjectRender(state: RenderState, root: Renderable): void {
  walkRenderSubtree(state, root, disposeRenderProxy);
}

// Disposes the framework-side render proxy for `source`: drops it from the renderProxyMap (a
// WeakMap, so this just makes the GC-managed proxy collectable sooner) and cascades to the
// renderer's destroyData to free the non-GC GPU resources it owns. Call when a node is removed from
// rendering for good — otherwise those GPU textures/framebuffers linger until the source is GC'd.
export function disposeRenderProxy(state: RenderState, source: Renderable): void {
  const renderProxyMap = getRenderStateRuntime(state).renderProxyMap;
  const node = renderProxyMap.get(source);
  if (node === undefined) return;
  if (node.rendererData !== null) node.renderer?.destroyData?.(state, node.rendererData);
  renderProxyMap.delete(source);
}

export function getOrCreateRenderProxy2D(state: RenderState, source: Renderable): RenderProxy2D {
  const runtime = getRenderStateRuntime(state);
  const renderProxyMap = runtime.renderProxyMap;
  let node = renderProxyMap.get(source) as RenderProxy2D | undefined;
  if (!node) {
    node = createRenderProxy2D(state, source as Renderable & HasTransform2D & HasBoundsRectangle);
    renderProxyMap.set(source, node);
  }
  if (node.rendererMapId !== runtime.rendererMapId) {
    updateRenderProxyRenderer(state, node);
  }
  return node;
}

export function getRenderProxy2D(state: RenderState, source: Renderable): RenderProxy2D | undefined {
  return getRenderStateRuntime(state).renderProxyMap.get(source) as RenderProxy2D | undefined;
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
  const currentFrameId = getRenderStateRuntime(state).currentFrameId;
  const parentDirty =
    parentData !== undefined &&
    (parentData.transformFrameId === currentFrameId || parentData.appearanceFrameId === currentFrameId);
  const localDirty =
    state.sceneGraphSyncPolicy === 'refreshDerivedState' ||
    data.lastLocalTransformId !== getNodeLocalTransformRevision(source as Node) ||
    data.lastAppearanceId !== getNodeAppearanceRevision(source as Node) ||
    data.lastLocalContentId !== getNodeLocalContentRevision(source as Node);
  return parentDirty || localDirty;
}

export function isRenderProxyVisible(data: RenderProxy2D): boolean {
  return data.visible && data.alpha > 0 && !(data.transform2D.a === 0 && data.transform2D.d === 0);
}

// The pre-render update pass for the 2D graph. Sprites align onto DisplayObject — they share one
// identical trait base — so there is a single prepare named for the trait-complete entity it readies
// (Node + DisplayObject traits); the former per-graph prepares collapsed into this. Masks were retired
// into clips, so there is no second tree pass; clips are realized by the backend clip hooks during the
// draw walk, keyed off each node's `clip`.
export function prepareDisplayObjectRender(state: RenderState, source: Renderable): boolean {
  return walkNode(state, source, updateRenderProxy2D);
}

// Sets a node's clip nesting depth from its parent. Stateless (derived from the parent's depth), so it
// composes as a trait update step. Both display objects and sprites carry the HasClip trait; a null
// clip contributes no depth (rect and path clips both count), so the same step is safe in every walk.
// Render caches (the other Renderable) leave the field undefined, which is also null-ish.
export function updateNodeClip(
  _state: RenderState,
  source: Renderable,
  data: RenderProxy2D,
  parentData: RenderProxy2D | undefined,
): void {
  const parentDepth = parentData !== undefined ? parentData.clipDepth : 0;
  data.clipDepth = parentDepth + ((source as DisplayObject).clip != null ? 1 : 0);
}

// The one per-node update step for the 2D walk: appearance, transform, material, then the clip nesting
// depth. Sprites and display objects share this single visitor.
export function updateRenderProxy2D(
  state: RenderState,
  source: Renderable,
  data: RenderProxy2D,
  parentData: RenderProxy2D | undefined,
): void {
  updateRenderProxyAppearance(state, data, parentData);
  updateRenderProxy2DTransform(state, data, parentData);
  updateRenderProxyMaterial(state, data, parentData);
  updateNodeClip(state, source, data, parentData);
  // Record the content revision we synced at, so a later content-only change re-dirties the node.
  data.lastLocalContentId = getNodeLocalContentRevision(source as Node);
  _adaptHook?.(state, source, data);
}

export function updateRenderProxyRenderer(state: RenderState, node: RenderProxy): void {
  const runtime = getRenderStateRuntime(state);
  const renderer = runtime.rendererMap.get(node.kind) ?? null;
  if (node.renderer !== renderer || node.rendererDataSource !== node.source) {
    // Free the outgoing renderer's GPU resources before replacing the data it owned.
    if (node.rendererData !== null) node.renderer?.destroyData?.(state, node.rendererData);
    node.renderer = renderer;
    node.rendererData = renderer?.createData(state, node.source) ?? null;
    node.rendererDataSource = node.source;
  }
  node.rendererMapId = runtime.rendererMapId;
}

// One generic, dirty-checked pre-order walk over the 2D node graph. `visit` composes the trait
// update* steps. Sprites and display objects share this single traversal and a single render-node
// type — what differs is the traits they carry, not the path. Clip is not handled here: it is a
// trait update step in the visitor (updateNodeClip), realized at draw time by the backend clip hooks.
export function walkNode(state: RenderState, root: Renderable, visit: RenderProxyVisitor): boolean {
  const runtime = getRenderStateRuntime(state);
  ++runtime.currentFrameId;

  const tempStack = runtime.tempStack;
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

// Pre-order walk over `root` and its full graph subtree, calling `visit` once per node. Unlike
// walkNode (the render-prepare walk), it advances no frame id and skips no nodes — disabled and
// hidden nodes are visited too, since their render proxies still need teardown. Shared by the
// dispose* render-teardown functions. Uses state.tempStack as scratch, so it must not run re-entrantly.
function walkRenderSubtree(
  state: RenderState,
  root: Renderable,
  visit: (state: RenderState, node: Renderable) => void,
): void {
  const tempStack = getRenderStateRuntime(state).tempStack;
  let stackLength = 1;
  tempStack[0] = root;

  while (stackLength > 0) {
    const current = tempStack[--stackLength] as Renderable;
    visit(state, current);
    const children = getNodeRuntime(current as Node).children;
    if (children !== null) {
      for (let i = children.length - 1; i >= 0; i--) {
        tempStack[stackLength++] = children[i] as unknown as Renderable;
      }
    }
  }
}
