import { getDisplayObjectRuntime } from '@flighthq/displayobject';
import { getRenderProxy2D, isRenderProxyVisible, noopRendererData } from '@flighthq/render';
import type { CanvasRenderState, DisplayObject, RenderProxy2D, Sprite, SpriteRenderer } from '@flighthq/types';

import { applyCanvasMaterial } from './canvasMaterialRegistry';
import { getCanvasRenderStateRuntime } from './canvasRenderState';

export function drawCanvasSprite(state: CanvasRenderState, spriteNode: RenderProxy2D): void {
  const source = spriteNode.source as Sprite;
  const { atlas, id } = source.data;
  if (atlas === null || atlas.image === null || atlas.image.source === null) return;

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

  const restoreMaterial = applyCanvasMaterial(state, spriteNode.material);

  context.setTransform(transform.a, transform.b, transform.c, transform.d, transform.tx, transform.ty);
  context.drawImage(
    atlas.image.source,
    region.x,
    region.y,
    region.width,
    region.height,
    0,
    0,
    region.width,
    region.height,
  );

  if (restoreMaterial) context.restore();

  if (!state.allowSmoothing) {
    context.imageSmoothingEnabled = true;
  }
}

export const defaultCanvasSpriteRenderer: SpriteRenderer = {
  createData: noopRendererData,
  submit: drawCanvasSprite,
};

export function renderCanvasSprite(state: CanvasRenderState, source: DisplayObject): void {
  const tempStack = getCanvasRenderStateRuntime(state).tempStack;
  let stackLength = 1;
  tempStack[0] = source;

  while (stackLength > 0) {
    const current = tempStack[--stackLength] as DisplayObject;
    if (!current.enabled) continue;
    const data = getRenderProxy2D(state, current);
    if (data === undefined || !isRenderProxyVisible(data)) continue;

    if (data.renderer !== null) data.renderer.submit(state, data);

    if (data.traverseChildren) {
      const children = getDisplayObjectRuntime(current).children;
      if (children !== null) {
        for (let i = children.length - 1; i >= 0; i--) {
          tempStack[stackLength++] = children[i] as DisplayObject;
        }
      }
    }
  }
}
