import { matrix3x2 } from '@flighthq/geometry';
import { colorTransform } from '@flighthq/materials';
import type { Renderable, RenderNode, RenderState } from '@flighthq/types';
import { BlendMode } from '@flighthq/types';

export function createRenderNode(state: RenderState, source: Renderable): RenderNode {
  const renderer = state.rendererMap.get(source.type);
  return {
    alpha: 1,
    appearanceFrameID: -1,
    blendMode: BlendMode.Normal,
    cacheAsBitmap: false,
    cacheBitmap: null,
    colorTransform: colorTransform.create(),
    isMaskFrameID: -1,
    lastAppearanceID: -1,
    lastLocalTransformID: -1,
    maskDepth: 0,
    renderer: renderer ?? null,
    rendererData: renderer?.createData(state, source) ?? null,
    rendererMapID: -1,
    scrollRectDepth: 0,
    shader: null,
    source: source,
    transform: matrix3x2.create(),
    transformFrameID: -1,
    useColorTransform: false,
    visible: true,
  };
}

export function getRenderNode(state: RenderState, source: Renderable): RenderNode {
  const renderNodeMap = state.renderNodeMap;
  let node = renderNodeMap.get(source);
  if (!node) {
    node = createRenderNode(state, source);
    renderNodeMap.set(source, node);
  }
  if (node.rendererMapID !== state.rendererMapID) {
    node.renderer = state.rendererMap.get(node.source.type) ?? null;
    node.rendererMapID = state.rendererMapID;
  }
  return node;
}
