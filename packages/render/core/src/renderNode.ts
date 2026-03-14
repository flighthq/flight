import { colorTransform } from '@flighthq/materials';
import { BlendMode, type Renderable, type RenderNode, type RenderState } from '@flighthq/types';

export function createRenderNode(state: RenderState, source: Renderable): RenderNode {
  const renderer = state.rendererMap.get(source.kind);
  return {
    alpha: 1,
    appearanceFrameID: -1,
    blendMode: BlendMode.Normal,
    colorTransform: colorTransform.create(),
    lastAppearanceID: -1,
    lastLocalTransformID: -1,
    renderer: renderer ?? null,
    rendererData: renderer?.createData(state, source) ?? null,
    rendererMapID: -1,
    shader: null,
    source: source,
    transformFrameID: -1,
    useColorTransform: false,
    visible: true,
  };
}

export function getRenderNode<Source extends Renderable, NodeType extends RenderNode>(
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
    node.renderer = state.rendererMap.get(node.source.kind) ?? null;
    node.rendererMapID = state.rendererMapID;
  }
  return node as NodeType;
}
