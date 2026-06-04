import { createEntity } from '@flighthq/entity';
import { createMatrix } from '@flighthq/geometry';
import { createColorTransform } from '@flighthq/materials';
import {
  BlendMode,
  type DisplayObject,
  type DisplayObjectRenderNode,
  type HasBoundsRect,
  type HasTransform2D,
  type Renderable,
  type RenderNode,
  type RenderNode2D,
  type RenderState,
  type SpriteNode,
  type SpriteRenderNode,
} from '@flighthq/types';

export function createDisplayObjectRenderNode(state: RenderState, source: DisplayObject): DisplayObjectRenderNode {
  const out = createRenderNode2D(state, source) as DisplayObjectRenderNode;
  out.isMaskFrameID = -1;
  out.maskDepth = 0;
  out.scrollRectangleDepth = 0;
  out.updateChildren = true;
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
  out.updateChildren = true;
  return out;
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

export function syncRenderNodeRenderer(state: RenderState, node: RenderNode): void {
  const renderer = state.rendererMap.get(node.kind) ?? null;
  if (node.renderer !== renderer || node.rendererDataSource !== node.source) {
    node.renderer = renderer;
    node.rendererData = renderer?.createData(state, node.source) ?? null;
    node.rendererDataSource = node.source;
  }
  node.rendererMapID = state.rendererMapID;
}
