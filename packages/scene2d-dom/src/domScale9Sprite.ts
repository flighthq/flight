import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { getTextureHeight, getTextureWidth } from '@flighthq/texture/contract';
import type {
  DomRenderState,
  EntityConstruction,
  RenderProxy2D,
  RenderState,
  Renderable,
  RendererData,
  Scale9Sprite,
  Scene2DRenderer,
} from '@flighthq/types/contract';

import { applyDomStyle, prepareDomElement, setDomRendererElement } from './domStyle';
import { resolveDomTexture } from './domTextureResolver';

interface DomScale9SpriteData extends RendererData {
  element: HTMLDivElement | null;
  pieces: HTMLCanvasElement[];
}
export function createDomScale9SpriteData(_state: RenderState, _source: Renderable): DomScale9SpriteData {
  const out = allocateEntity<DomScale9SpriteData>();
  initializeDomScale9SpriteData(out, _state, _source);
  return finishEntity(out);
}

export function drawDomScale9Sprite(state: DomRenderState, renderProxy: RenderProxy2D): void {
  const data = renderProxy.rendererData as DomScale9SpriteData | null;
  if (data === null) return;
  const source = renderProxy.source as Scale9Sprite;
  const texture = source.data.texture;
  if (texture === null || texture.dimension !== '2d') return;
  const image = resolveDomTexture(state, texture);
  if (image === null) return;
  const tw = getTextureWidth(texture),
    th = getTextureHeight(texture),
    g = source.data.scale9Grid;
  const width = Math.max(1, tw * source.scaleX),
    height = Math.max(1, th * source.scaleY);
  if (data.element === null) {
    data.element = document.createElement('div');
    prepareDomElement(data.element);
    for (let i = 0; i < 9; i++) {
      const p = document.createElement('canvas');
      prepareDomElement(p);
      data.pieces.push(p);
      data.element.append(p);
    }
  }
  const xs = [0, g.x, g.x + g.width, tw],
    ys = [0, g.y, g.y + g.height, th];
  const dx = [0, g.x * source.scaleX, width - (tw - g.x - g.width) * source.scaleX, width];
  const dy = [0, g.y * source.scaleY, height - (th - g.y - g.height) * source.scaleY, height];
  const pr = state.pixelRatio;
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) {
      const p = data.pieces[r * 3 + c]!,
        w = Math.max(0, dx[c + 1]! - dx[c]!),
        h = Math.max(0, dy[r + 1]! - dy[r]!);
      p.width = Math.max(1, Math.ceil(w * pr));
      p.height = Math.max(1, Math.ceil(h * pr));
      p.style.width = `${w}px`;
      p.style.height = `${h}px`;
      p.style.left = `${dx[c]}px`;
      p.style.top = `${dy[r]}px`;
      const ctx = p.getContext('2d')!;
      ctx.setTransform(pr, 0, 0, pr, 0, 0);
      ctx.imageSmoothingEnabled = state.allowSmoothing && !texture.sampler.magFilter.startsWith('nearest');
      ctx.clearRect(0, 0, w, h);
      if (w > 0 && h > 0) ctx.drawImage(image, xs[c]!, ys[r]!, xs[c + 1]! - xs[c]!, ys[r + 1]! - ys[r]!, 0, 0, w, h);
    }
  data.element.style.width = `${width}px`;
  data.element.style.height = `${height}px`;
  applyDomStyle(state, data.element, renderProxy);
  const t = renderProxy.transform2D;
  const sx = source.scaleX !== 0 ? t.a / source.scaleX : t.a;
  const sy = source.scaleY !== 0 ? t.d / source.scaleY : t.d;
  data.element.style.transform = `matrix(${sx},${t.b},${t.c},${sy},${t.tx},${t.ty})`;
  setDomRendererElement(state, data.element);
}
export function initializeDomScale9SpriteData(
  out: EntityConstruction<DomScale9SpriteData>,
  _state: RenderState,
  _source: Renderable,
): void {
  out.element = null;
  out.pieces = [];
}
export const defaultDomScale9SpriteRenderer: Scene2DRenderer = {
  createData: createDomScale9SpriteData,
  submit: drawDomScale9Sprite,
};
