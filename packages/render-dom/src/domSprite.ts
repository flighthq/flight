import { createEntity } from '@flighthq/entity';
import { getSpriteRenderNode } from '@flighthq/render-core';
import { getSpriteNodeRuntime } from '@flighthq/scenegraph-sprite';
import type {
  DOMRenderState,
  Renderable,
  RendererData,
  RenderState,
  Sprite,
  SpriteNode,
  SpriteRenderer,
  SpriteRenderNode,
} from '@flighthq/types';

import { applyDOMStyle, initDOMElement } from './domStyle';

interface DOMSpriteData extends RendererData {
  canvas: HTMLCanvasElement | null;
  context: CanvasRenderingContext2D | null;
}

function createDOMSpriteData(_state: RenderState, _source: Renderable): DOMSpriteData {
  return createEntity({ canvas: null, context: null });
}

export function drawDOMSprite(state: DOMRenderState, spriteNode: SpriteRenderNode): void {
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
  state.element.appendChild(data.canvas);
}

export function renderDOMSprite(state: DOMRenderState, source: SpriteNode): void {
  const container = state.element;
  while (container.firstChild) container.removeChild(container.firstChild);

  const tempStack = state.tempStack;
  let stackLength = 0;
  tempStack[stackLength++] = source;

  while (stackLength > 0) {
    const current = tempStack[--stackLength] as SpriteNode;
    const data = getSpriteRenderNode(state, current);

    const shouldRender = data.visible && data.alpha > 0 && (data.transform2D.a !== 0 || data.transform2D.d !== 0);
    if (!shouldRender) continue;

    if (data.renderer !== null) {
      data.renderer.draw(state, data);
    }

    const children = getSpriteNodeRuntime(current).children;
    if (children !== null) {
      for (let i = children.length - 1; i >= 0; i--) {
        tempStack[stackLength++] = children[i] as SpriteNode;
      }
    }
  }
}

export const defaultDOMSpriteRenderer: SpriteRenderer = {
  createData: createDOMSpriteData as SpriteRenderer['createData'],
  draw: drawDOMSprite,
};
