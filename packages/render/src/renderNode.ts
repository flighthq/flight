import { createEntity } from '@flighthq/entity';
import { createMatrix } from '@flighthq/geometry';
import { createColorTransform } from '@flighthq/materials';
import { BlendMode, type Renderable, type RenderNode, type RenderState } from '@flighthq/types';

export function createRenderNode(state: RenderState, source: Renderable): RenderNode {
  const renderer = state.rendererMap.get(source.kind) ?? null;
  return createEntity({
    owner: source,
    source: source,
    kind: source.kind,
    transform2D: createMatrix(),
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

export function syncRenderNodeRenderer(state: RenderState, node: RenderNode): void {
  const renderer = state.rendererMap.get(node.kind) ?? null;
  if (node.renderer !== renderer || node.rendererDataSource !== node.source) {
    node.renderer = renderer;
    node.rendererData = renderer?.createData(state, node.source) ?? null;
    node.rendererDataSource = node.source;
  }
  node.rendererMapID = state.rendererMapID;
}
