import { matrix3x2 } from '@flighthq/geometry';
import { colorTransform } from '@flighthq/materials';
import type {
  DisplayObject,
  DisplayObjectRenderNode,
  Renderable,
  RenderNode,
  RenderState,
  SpriteBase,
  SpriteRenderNode,
} from '@flighthq/types';
import { BlendMode } from '@flighthq/types';

export function createDisplayObjectRenderNode(state: RenderState, source: DisplayObject): DisplayObjectRenderNode {
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

export function createSpriteRenderNode(state: RenderState, source: SpriteBase): SpriteRenderNode {
  const renderer = state.rendererMap.get(source.type);
  return {
    alpha: 1,
    appearanceFrameID: -1,
    blendMode: BlendMode.Normal,
    colorTransform: colorTransform.create(),
    isMaskFrameID: -1,
    lastAppearanceID: -1,
    lastLocalTransformID: -1,
    renderer: renderer ?? null,
    rendererData: renderer?.createData(state, source) ?? null,
    rendererMapID: -1,
    shader: null,
    source: source,
    transform: matrix3x2.create(),
    transformFrameID: -1,
    useColorTransform: false,
    visible: true,
  };
}

// export function createRenderNode(state: RenderState, source: Renderable): DisplayObjectRenderNode {
//   const renderer = state.rendererMap.get(source.type);
//   return {
//     alpha: 1,
//     appearanceFrameID: -1,
//     blendMode: BlendMode.Normal,
//     cacheAsBitmap: false,
//     cacheBitmap: null,
//     colorTransform: colorTransform.create(),
//     isMaskFrameID: -1,
//     lastAppearanceID: -1,
//     lastLocalTransformID: -1,
//     maskDepth: 0,
//     renderer: renderer ?? null,
//     rendererData: renderer?.createData(state, source) ?? null,
//     rendererMapID: -1,
//     scrollRectDepth: 0,
//     shader: null,
//     source: source,
//     transform: matrix3x2.create(),
//     transformFrameID: -1,
//     useColorTransform: false,
//     visible: true,
//   };
// }

export function getDisplayObjectRenderNode(state: RenderState, source: DisplayObject): DisplayObjectRenderNode {
  return getRenderNode(state, source, createDisplayObjectRenderNode);
}

export function getSpriteRenderNode(state: RenderState, source: SpriteBase): SpriteRenderNode {
  return getRenderNode(state, source, createSpriteRenderNode);
}

function getRenderNode<T extends Renderable, N extends RenderNode>(
  state: RenderState,
  source: T,
  createNode: (state: RenderState, src: T) => N,
): N {
  const renderNodeMap = state.renderNodeMap;
  let node = renderNodeMap.get(source) as N | undefined;
  if (!node) {
    node = createNode(state, source);
    renderNodeMap.set(source, node);
  }
  if (node.rendererMapID !== state.rendererMapID) {
    node.renderer = state.rendererMap.get(node.source.type) ?? null;
    node.rendererMapID = state.rendererMapID;
  }
  return node;
}
