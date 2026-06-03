import { createEntity } from '@flighthq/entity';
import { getOrCreateSpriteRenderNode } from '@flighthq/render';
import { getSpriteNodeRuntime } from '@flighthq/scene-sprite';
import type {
  DOMRenderState,
  Renderable,
  RendererData,
  RenderState,
  Sprite,
  SpriteNode,
  SpriteRenderer,
  SpriteRenderTreeNode,
} from '@flighthq/types';

import { detectDOMStructureChange, processDOMNode, reconcileDOMContainer, swapDOMOrderLists } from './domReconcile';
import { applyDOMStyle, initDOMElement, setDOMRendererElement } from './domStyle';
import type { DOMRenderStateInternal } from './internal';

interface DOMSpriteData extends RendererData {
  canvas: HTMLCanvasElement | null;
  context: CanvasRenderingContext2D | null;
}

function createDOMSpriteData(_state: RenderState, _source: Renderable): DOMSpriteData {
  return createEntity({ canvas: null, context: null });
}

export function drawDOMSprite(state: DOMRenderState, spriteNode: SpriteRenderTreeNode): void {
  const source = spriteNode.source as Sprite;
  const { atlas, id } = source.data;
  if (atlas === null || atlas.image === null || atlas.image.src === null) return;

  const regions = atlas.regions;
  if (id < 0 || id >= regions.length) return;

  const region = regions[id];
  if (region.width <= 0 || region.height <= 0) return;

  const data = spriteNode.rendererData as DOMSpriteData | null;
  if (data === null) return;

  if (data.canvas === null) {
    data.canvas = document.createElement('canvas');
    data.context = data.canvas.getContext('2d');
    initDOMElement(data.canvas);
  }

  const pr = state.pixelRatio;
  data.canvas.width = region.width * pr;
  data.canvas.height = region.height * pr;
  data.canvas.style.width = region.width + 'px';
  data.canvas.style.height = region.height + 'px';

  const ctx = data.context!;
  ctx.imageSmoothingEnabled = state.allowSmoothing;
  ctx.drawImage(
    atlas.image.src,
    region.x,
    region.y,
    region.width,
    region.height,
    0,
    0,
    region.width * pr,
    region.height * pr,
  );

  applyDOMStyle(state, data.canvas, spriteNode);
  setDOMRendererElement(state, data.canvas);
}

export function renderDOMSprite(state: DOMRenderState, source: SpriteNode): void {
  const internal = state as DOMRenderStateInternal;
  const container = state.element;
  const currentFrameID = state.currentFrameID;
  const tempStack = state.tempStack;

  let newLength = 0;
  let needsReconcile = false;
  let stackLength = 0;
  tempStack[stackLength++] = source;

  while (stackLength > 0) {
    const current = tempStack[--stackLength] as SpriteNode;
    const data = getOrCreateSpriteRenderNode(state, current);

    const shouldRender = data.visible && data.alpha > 0 && (data.transform2D.a !== 0 || data.transform2D.d !== 0);
    if (!shouldRender) continue;

    if (data.renderer !== null) {
      const result = processDOMNode(internal, data, currentFrameID, () => data.renderer!.draw(state, data), newLength);
      newLength = result.newLength;
      if (result.needsReconcile) needsReconcile = true;
    }

    const children = getSpriteNodeRuntime(current).children;
    if (children !== null) {
      for (let i = children.length - 1; i >= 0; i--) {
        tempStack[stackLength++] = children[i] as SpriteNode;
      }
    }
  }

  if (detectDOMStructureChange(internal, newLength, needsReconcile)) {
    reconcileDOMContainer(container, internal, newLength);
  }

  swapDOMOrderLists(internal, newLength);
}

export const defaultDOMSpriteRenderer: SpriteRenderer = {
  createData: createDOMSpriteData as SpriteRenderer['createData'],
  draw: drawDOMSprite,
};
