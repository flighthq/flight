import { createEntity } from '@flighthq/entity/contract';
import { createMatrix } from '@flighthq/geometry/contract';
import {
  getNodeAppearanceRevision,
  getNodeChildrenRevision,
  getNodeLocalContentRevision,
  getNodeLocalTransformRevision,
  getNodeParentReferenceRevision,
  getNodeParent,
  getNodeRuntime,
} from '@flighthq/node/contract';
import type {
  Node2D,
  HasBoundsRectangle,
  HasTransform2D,
  Node,
  Renderable,
  RenderProxy,
  RenderProxy2D,
  RenderProxyVisitor,
  RenderState,
} from '@flighthq/types/contract';
import { BlendMode, RegistryEntryState, RenderRegistry } from '@flighthq/types/contract';

import { updateRenderProxyAppearance } from './renderAppearance';
import { updateRenderProxyMaterial } from './renderMaterial';
import { getRenderStateRuntime } from './renderState';
import { updateRenderProxy2DTransform } from './renderTransform2d';

type AdaptHook = (state: RenderState, source: Renderable, data: RenderProxy2D) => void;

export function createRenderProxy(state: RenderState, source: Renderable): RenderProxy {
  const runtime = getRenderStateRuntime(state);
  const renderer = resolveRenderProxyRenderer(state, source.kind);
  return createEntity({
    source: source,
    kind: source.kind,
    next: null,
    alpha: 1,
    appearanceFrameId: -1,
    blendMode: BlendMode.Normal,
    colorScaleBias: null,
    colorMatrix: null,
    material: null,
    materialData: null,
    lastAppearanceId: -1,
    lastChildrenId: -1,
    lastLocalContentId: -1,
    lastLocalTransformId: -1,
    lastParentReferenceId: -1,
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

// Disposes the framework-side render proxy for `source`: drops it from the renderProxyMap (a
// WeakMap, so this just makes the GC-managed proxy collectable sooner) and cascades to the
// renderer's destroyData to free the non-GC GPU resources it owns. Call when a node is removed from
// rendering for good — otherwise those GPU textures/framebuffers linger until the source is GC'd.
export function disposeRenderProxy(state: RenderState, source: Renderable): void {
  const runtime = getRenderStateRuntime(state);
  const renderProxyMap = runtime.renderProxyMap;
  const node = renderProxyMap.get(source);
  if (node === undefined) return;
  if (node.rendererData !== null) node.renderer?.destroyData?.(state, node.rendererData);
  renderProxyMap.delete(source);
  runtime.renderProxySources.delete(source);
}

// Teardown counterpart to prepareScene2DRender: disposes the render of `root` and every descendant —
// the render proxies that prepareScene2DRender created. Each disposeRenderProxy cascades to the
// renderer's destroyData, so the GPU textures/framebuffers are freed now while the proxies become
// GC-eligible. Sprites and display objects share one render proxy, so a single dispose serves both;
// there is no mask proxy to dispose separately (masks were retired into clips). Call after
// removeNodeChild for nodes that will never be rendered again. Unlike prepareScene2DRender, this visits
// all nodes regardless of enabled or visible state.
export function disposeScene2DRender(state: RenderState, root: Renderable): void {
  walkRenderSubtree(state, root, disposeRenderProxy);
}

export function getOrCreateRenderProxy2D(state: RenderState, source: Renderable): RenderProxy2D {
  const runtime = getRenderStateRuntime(state);
  const renderProxyMap = runtime.renderProxyMap;
  let node = renderProxyMap.get(source) as RenderProxy2D | undefined;
  if (!node) {
    node = createRenderProxy2D(state, source as Renderable & HasTransform2D & HasBoundsRectangle);
    renderProxyMap.set(source, node);
    runtime.renderProxySources.add(source);
  }
  if (node.rendererMapId !== runtime.rendererMapId) {
    updateRenderProxyRenderer(state, node);
  }
  return node;
}

export function getRenderProxy2D(state: RenderState, source: Renderable): RenderProxy2D | undefined {
  return getRenderStateRuntime(state).renderProxyMap.get(source) as RenderProxy2D | undefined;
}

export function installRenderAdaptHook(state: RenderState, fn: AdaptHook): void {
  getRenderStateRuntime(state).renderAdaptHook = fn;
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
  const rendererDirty = data.renderer?.isDirty?.(state, source, data.rendererData) ?? false;
  const hierarchyDirty =
    data.lastChildrenId !== getNodeChildrenRevision(source as Node) ||
    data.lastParentReferenceId !== getNodeParentReferenceRevision(source as Node);
  const localDirty =
    state.sceneGraphSyncPolicy === 'refreshDerivedState' ||
    data.lastLocalTransformId !== getNodeLocalTransformRevision(source as Node) ||
    data.lastAppearanceId !== getNodeAppearanceRevision(source as Node) ||
    data.lastLocalContentId !== getNodeLocalContentRevision(source as Node);
  return parentDirty || rendererDirty || hierarchyDirty || localDirty;
}

export function isRenderProxyVisible(data: RenderProxy2D): boolean {
  return data.visible && data.alpha > 0 && !(data.transform2D.a === 0 && data.transform2D.d === 0);
}

// The pre-render update pass for the 2D graph. Sprites align onto Node2D — they share one
// identical trait base — so there is a single prepare named for the trait-complete entity it readies
// (Node + Node2D traits); the former per-graph prepares collapsed into this. Masks were retired
// into clips, so there is no second tree pass; clips are realized by the backend clip hooks during the
// draw walk, keyed off each node's `clip`.
export function prepareScene2DRender(state: RenderState, source: Renderable): boolean {
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
  data.clipDepth = parentDepth + ((source as Node2D).clip != null ? 1 : 0);
}

// The one per-node update step for the 2D walk: appearance, transform, material, color adjustment,
// then the clip nesting depth. Sprites and display objects share this single visitor.
export function updateRenderProxy2D(
  state: RenderState,
  source: Renderable,
  data: RenderProxy2D,
  parentData: RenderProxy2D | undefined,
): void {
  const parentReferenceId = getNodeParentReferenceRevision(source as Node);
  if (data.lastParentReferenceId !== parentReferenceId) {
    // A prepared node may be detached while its eventual parent changes, then reattached to the same
    // parent identity. Force both inherited axes through their existing update paths; comparing only
    // the current parent or its "updated this frame" marker would leave that warm proxy stale.
    data.lastAppearanceId = -1;
    data.lastLocalTransformId = -1;
  }
  updateRenderProxyAppearance(state, data, parentData);
  updateRenderProxy2DTransform(state, data, parentData);
  updateRenderProxyMaterial(state, data, parentData);
  const colorAdjustmentResolver = getRenderStateRuntime(state).registries.colorAdjustments?.entry;
  if (colorAdjustmentResolver?.state === RegistryEntryState.Bound) {
    colorAdjustmentResolver.value(state, data, parentData);
  }
  updateNodeClip(state, source, data, parentData);
  // Record the local and structural revisions this adaptation consumed.
  data.lastChildrenId = getNodeChildrenRevision(source as Node);
  data.lastLocalContentId = getNodeLocalContentRevision(source as Node);
  data.lastParentReferenceId = parentReferenceId;
  getRenderStateRuntime(state).renderAdaptHook?.(state, source, data);
}

export function updateRenderProxyRenderer(state: RenderState, node: RenderProxy): void {
  const runtime = getRenderStateRuntime(state);
  const renderer = resolveRenderProxyRenderer(state, node.kind);
  if (node.renderer !== renderer || node.rendererDataSource !== node.source) {
    // Free the outgoing renderer's GPU resources before replacing the data it owned.
    if (node.rendererData !== null) node.renderer?.destroyData?.(state, node.rendererData);
    node.renderer = renderer;
    node.rendererData = renderer?.createData(state, node.source) ?? null;
    node.rendererDataSource = node.source;
  }
  node.rendererMapId = runtime.rendererMapId;
}

function resolveRenderProxyRenderer(state: RenderState, kind: string) {
  const runtime = getRenderStateRuntime(state);
  const entry = runtime.registries.renderers.entries.get(kind);
  if (entry?.state !== RegistryEntryState.Bound) {
    runtime.registryMiss?.(RenderRegistry.NodeRenderer, kind);
    return null;
  }
  return entry.value;
}

// One generic, dirty-checked pre-order walk over the 2D node graph. `visit` composes the trait
// update* steps. Sprites and display objects share this single traversal and a single render-node
// type — what differs is the traits they carry, not the path. Clip is not handled here: it is a
// trait update step in the visitor (updateNodeClip), realized at draw time by the backend clip hooks.
export function walkNode(state: RenderState, root: Renderable, visit: RenderProxyVisitor): boolean {
  const runtime = getRenderStateRuntime(state);
  runtime.renderRootGuard?.(state, root);
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
