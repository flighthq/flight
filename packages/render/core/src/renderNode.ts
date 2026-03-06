import { matrix3x2 } from '@flighthq/geometry';
import { colorTransform } from '@flighthq/materials';
import type { Renderable, RendererState, RenderNode } from '@flighthq/types';
import { BlendMode } from '@flighthq/types';

import { updateAppearance } from './appearance';
import type { RendererStateInternal } from './internal';
import { updateRenderTransform } from './transform';

export function createRenderNode(state: RendererState, source: Renderable): RenderNode {
  const renderer = state.rendererMap.get(source.kind);
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

export function getRenderNode(state: RendererState, source: Renderable): RenderNode {
  const renderNodeMap = state.renderNodeMap;
  let node = renderNodeMap.get(source);
  if (!node) {
    node = createRenderNode(state, source);
    renderNodeMap.set(source, node);
  }
  if (node.rendererMapID !== state.rendererMapID) {
    node.renderer = state.rendererMap.get(node.source.kind) ?? null;
    node.rendererMapID = state.rendererMapID;
  }
  return node;
}

/**
 * First pass, update appearance, transforms, identify masks
 */
export function updateRenderableTree(state: RendererState, source: Renderable): boolean {
  const tempStack = state.tempStack;
  const currentFrameID = ++(state as RendererStateInternal).currentFrameID;

  let stackLength = 1;
  tempStack[0] = source;

  let parentData: RenderNode | undefined = undefined;
  let lastParent: Renderable | null = null;
  let scrollRectDepth: number = 0;
  let maskDepth: number = 0;
  let treeDirty = false;

  while (stackLength > 0) {
    const current = tempStack[--stackLength];
    const data = getRenderNode(state, current);

    if (current !== source) {
      const parent = current.parent;
      if (parent === null) {
        parentData = undefined;
        lastParent = null;
        scrollRectDepth = 0;
        maskDepth = 0;
      } else if (parent !== lastParent) {
        parentData = getRenderNode(state, parent);
        lastParent = parent;
        scrollRectDepth = parentData.scrollRectDepth;
        maskDepth = parentData.maskDepth;
      }
    }

    const appearanceDirty = updateAppearance(state, data, parentData);
    const transformDirty = updateRenderTransform(state, data, parentData);

    if (!treeDirty) {
      treeDirty = appearanceDirty || transformDirty;
    }

    if (current.scrollRect !== null) {
      data.scrollRectDepth = ++scrollRectDepth;
    } else {
      data.scrollRectDepth = scrollRectDepth;
    }

    const mask = current.mask;
    if (mask !== null) {
      const maskData = getRenderNode(state, mask);
      maskData.isMaskFrameID = currentFrameID;
      maskData.scrollRectDepth = 0;
      maskData.maskDepth = 0;
      tempStack[stackLength++] = mask;
      data.maskDepth = ++maskDepth;
    } else {
      data.maskDepth = maskDepth;
    }

    if (current.children !== null) {
      for (let i = current.children.length - 1; i >= 0; i--) {
        tempStack[stackLength++] = current.children[i];
      }
    }
  }

  return treeDirty;
}
