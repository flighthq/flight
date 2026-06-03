import { createEntity } from '@flighthq/entity';
import { createColorTransform } from '@flighthq/materials';
import { BlendMode, type Renderable, type RenderState, type RenderNode } from '@flighthq/types';

export function createRenderNode(state: RenderState, source: Renderable): RenderNode {
  const renderer = state.rendererMap.get(source.kind) ?? null;
  return createEntity({
    alpha: 1,
    appearanceFrameID: -1,
    blendMode: BlendMode.Normal,
    colorTransform: createColorTransform(),
    kind: source.kind,
    lastAppearanceID: -1,
    lastLocalTransformID: -1,
    name: null,
    presentationSource: null,
    renderer: renderer,
    rendererData: renderer?.createData(state, source) ?? null,
    rendererDataSource: source,
    rendererMapID: state.rendererMapID,
    shader: null,
    source: source,
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
  const rendererDataSource = node.presentationSource ?? node.source;
  if (node.renderer !== renderer || node.rendererDataSource !== rendererDataSource) {
    node.renderer = renderer;
    node.rendererData = renderer?.createData(state, rendererDataSource) ?? null;
    node.rendererDataSource = rendererDataSource;
  }
  node.rendererMapID = state.rendererMapID;
}
