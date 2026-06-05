import { createEntity } from '@flighthq/entity';
import { getSpriteRenderNode, isRenderNodeVisible } from '@flighthq/render';
import { getSpriteNodeRuntime } from '@flighthq/scene-sprite';
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
import { QuadBatchKind, TilemapKind } from '@flighthq/types';

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
  setDOMRendererElement(state, data.canvas);
}

export const defaultDOMSpriteRenderer: SpriteRenderer = {
  createData: createDOMSpriteData as SpriteRenderer['createData'],
  draw: drawDOMSprite,
};

export function isMutableSpriteBatchKind(kind: symbol): boolean {
  return kind === QuadBatchKind || kind === TilemapKind;
}

export function renderDOMSprite(state: DOMRenderState, source: SpriteNode): void {
  const internal = state as DOMRenderStateInternal;
  const container = state.element;
  const tempStack = state.tempStack;

  let stackLength = 1;
  tempStack[0] = source;

  let newLength = 0;
  let needsReconcile = false;

  while (stackLength > 0) {
    const current = tempStack[--stackLength] as SpriteNode;
    if (!current.enabled) continue;
    const data = getSpriteRenderNode(state, current);
    if (data === undefined || !isRenderNodeVisible(data)) continue;

    if (data.renderer !== null) {
      const result = processDOMNode(
        internal,
        data,
        state.currentFrameID,
        () => data.renderer!.draw(state, data),
        newLength,
        isMutableSpriteBatchKind(current.kind),
      );
      newLength = result.newLength;
      if (result.needsReconcile) needsReconcile = true;
    }

    if (data.traverseChildren) {
      const children = getSpriteNodeRuntime(current).children;
      if (children !== null) {
        for (let i = children.length - 1; i >= 0; i--) {
          tempStack[stackLength++] = children[i] as SpriteNode;
        }
      }
    }
  }

  if (detectDOMStructureChange(internal, newLength, needsReconcile)) {
    reconcileDOMContainer(container, internal, newLength);
  }

  swapDOMOrderLists(internal, newLength);
}
