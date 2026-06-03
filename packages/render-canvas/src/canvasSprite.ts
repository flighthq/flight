import { createNullRendererData } from '@flighthq/render';
import { getOrCreateSpriteRenderNode } from '@flighthq/render';
import { getSpriteNodeRuntime } from '@flighthq/scene-sprite';
import type { CanvasRenderState, Sprite, SpriteNode, SpriteRenderer, SpriteRenderNode } from '@flighthq/types';

import { setCanvasBlendMode } from './canvasMaterials';

export function drawCanvasSprite(state: CanvasRenderState, spriteNode: SpriteRenderNode): void {
  const source = spriteNode.source as Sprite;
  const { atlas, id } = source.data;
  if (atlas === null || atlas.image === null || atlas.image.src === null) return;

  const regions = atlas.regions;
  if (id < 0 || id >= regions.length) return;

  const region = regions[id];
  if (region.width <= 0 || region.height <= 0) return;

  setCanvasBlendMode(state, spriteNode.blendMode);

  const context = state.context;
  const transform = spriteNode.transform2D;

  context.globalAlpha = spriteNode.alpha;

  if (!state.allowSmoothing) {
    context.imageSmoothingEnabled = false;
  }

  context.setTransform(transform.a, transform.b, transform.c, transform.d, transform.tx, transform.ty);
  context.drawImage(
    atlas.image.src,
    region.x,
    region.y,
    region.width,
    region.height,
    0,
    0,
    region.width,
    region.height,
  );

  if (!state.allowSmoothing) {
    context.imageSmoothingEnabled = true;
  }
}

function drawObject(state: CanvasRenderState, data: SpriteRenderNode): void {
  if (data.renderer === null) return;
  data.renderer.draw(state, data);
}

export function renderCanvasSprite(state: CanvasRenderState, source: SpriteNode): void {
  // const currentFrameID = state.currentFrameID;
  const tempStack = state.tempStack;
  let stackLength = 0;

  // Start with root
  tempStack[stackLength++] = source;

  while (stackLength > 0) {
    const current = tempStack[--stackLength] as SpriteNode;
    const data = getOrCreateSpriteRenderNode(state, current);

    const shouldRender = data.visible && data.alpha > 0 && (data.transform2D.a !== 0 || data.transform2D.d !== 0);
    if (!shouldRender) continue;

    // Ã¢â€â‚¬Ã¢â€â‚¬ Draw current object first (pre-order) Ã¢â€â‚¬Ã¢â€â‚¬
    drawObject(state, data);

    // Then push children in forward order (so we pop & draw index 0 first)
    const children = getSpriteNodeRuntime(current).children;
    if (children !== null) {
      // Push from last to first Ã¢â€ â€™ pop gives index 0 first
      for (let i = children.length - 1; i >= 0; i--) {
        tempStack[stackLength++] = children[i] as SpriteNode;
      }
    }
  }
}

export const defaultCanvasSpriteRenderer: SpriteRenderer = {
  createData: createNullRendererData,
  draw: drawCanvasSprite,
};
