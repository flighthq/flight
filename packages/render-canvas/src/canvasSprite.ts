import { getSpriteRenderNode, isRenderNodeVisible, noopRendererData } from '@flighthq/render';
import { getSpriteNodeRuntime } from '@flighthq/sprite';
import type { CanvasRenderState, Sprite, SpriteNode, SpriteRenderer, SpriteRenderNode } from '@flighthq/types';

export function drawCanvasSprite(state: CanvasRenderState, spriteNode: SpriteRenderNode): void {
  const source = spriteNode.source as Sprite;
  const { atlas, id } = source.data;
  if (atlas === null || atlas.image === null || atlas.image.src === null) return;

  const regions = atlas.regions;
  if (id < 0 || id >= regions.length) return;

  const region = regions[id];
  if (region.width <= 0 || region.height <= 0) return;

  state.applyBlendMode?.(state, spriteNode.blendMode);

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

export const defaultCanvasSpriteRenderer: SpriteRenderer = {
  createData: noopRendererData,
  submit: drawCanvasSprite,
};

export function renderCanvasSprite(state: CanvasRenderState, source: SpriteNode): void {
  const tempStack = state.tempStack;
  let stackLength = 1;
  tempStack[0] = source;

  while (stackLength > 0) {
    const current = tempStack[--stackLength] as SpriteNode;
    if (!current.enabled) continue;
    const data = getSpriteRenderNode(state, current);
    if (data === undefined || !isRenderNodeVisible(data)) continue;

    if (data.renderer !== null) data.renderer.submit(state, data);

    if (data.traverseChildren) {
      const children = getSpriteNodeRuntime(current).children;
      if (children !== null) {
        for (let i = children.length - 1; i >= 0; i--) {
          tempStack[stackLength++] = children[i] as SpriteNode;
        }
      }
    }
  }
}
