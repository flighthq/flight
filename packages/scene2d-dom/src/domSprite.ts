import { drawCanvasTextureView } from '@flighthq/scene2d-canvas/contract';
import { createSpriteRendererData, isSpriteRendererDirty } from '@flighthq/scene2d/contract';
import { getTextureHeight, getTextureViewSize, getTextureWidth } from '@flighthq/texture/contract';
import type {
  DomRenderState,
  Renderable,
  RenderProxy2D,
  RenderState,
  Scene2DRenderer,
  Sprite,
  SpriteIdentityRendererData,
  Texture2D,
} from '@flighthq/types/contract';

import { applyDomStyle, prepareDomElement, setDomRendererElement } from './domStyle';
import { resolveDomTexture } from './domTextureResolver';

interface DomSpriteData extends SpriteIdentityRendererData {
  canvas: HTMLCanvasElement | null;
  context: CanvasRenderingContext2D | null;
  image: HTMLImageElement | null;
  video: HTMLVideoElement | null;
}

function createDomSpriteData(state: RenderState, source: Renderable): DomSpriteData {
  const data = createSpriteRendererData(state, source) as DomSpriteData;
  data.canvas = null;
  data.context = null;
  data.image = null;
  data.video = null;
  return data;
}

export function drawDomSprite(state: DomRenderState, renderProxy: RenderProxy2D): void {
  const data = renderProxy.rendererData as DomSpriteData | null;
  if (data === null) return;

  const texture = (renderProxy.source as Sprite).data.texture;
  if (texture === null || texture.dimension !== '2d') return;
  const source = resolveDomTexture(state, texture);
  if (source === null) return;

  const textureWidth = getTextureWidth(texture);
  const textureHeight = getTextureHeight(texture);
  getTextureViewSize(spriteViewSize, texture);
  const viewWidth = spriteViewSize.x;
  const viewHeight = spriteViewSize.y;
  if (viewWidth <= 0 || viewHeight <= 0) return;
  const isFullTexture =
    texture.uvOffset.x === 0 &&
    texture.uvOffset.y === 0 &&
    texture.uvScale.x === 1 &&
    texture.uvScale.y === 1 &&
    texture.uvRotation === 0 &&
    !texture.flipX &&
    !texture.flipY &&
    viewWidth === textureWidth &&
    viewHeight === textureHeight;

  if (isFullTexture && source instanceof HTMLVideoElement) {
    renderSpriteAsVideo(state, renderProxy, data, source);
  } else if (isFullTexture && source instanceof HTMLImageElement) {
    renderSpriteAsImage(state, renderProxy, data, source);
  } else {
    renderSpriteAsCanvas(state, renderProxy, data, source, texture, viewWidth, viewHeight);
  }
}

function renderSpriteAsCanvas(
  state: DomRenderState,
  renderProxy: RenderProxy2D,
  data: DomSpriteData,
  source: CanvasImageSource,
  texture: Readonly<Texture2D>,
  viewWidth: number,
  viewHeight: number,
): void {
  data.image = null;
  data.video = null;
  if (data.canvas === null) {
    data.canvas = document.createElement('canvas');
    data.context = data.canvas.getContext('2d');
    prepareDomElement(data.canvas);
  }

  const pixelRatio = state.pixelRatio;
  data.canvas.width = Math.ceil(viewWidth * pixelRatio);
  data.canvas.height = Math.ceil(viewHeight * pixelRatio);
  data.canvas.style.width = `${viewWidth}px`;
  data.canvas.style.height = `${viewHeight}px`;

  const context = data.context!;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.imageSmoothingEnabled = state.allowSmoothing && !texture.sampler.magFilter.startsWith('nearest');
  drawCanvasTextureView(context, source, texture, viewWidth, viewHeight);
  applyDomStyle(state, data.canvas, renderProxy);
  applyDomSpriteSampling(state, data.canvas, renderProxy);
  setDomRendererElement(state, data.canvas);
}

function renderSpriteAsImage(
  state: DomRenderState,
  renderProxy: RenderProxy2D,
  data: DomSpriteData,
  source: HTMLImageElement,
): void {
  data.canvas = null;
  data.context = null;
  data.video = null;
  if (data.image === null) {
    data.image = document.createElement('img');
    data.image.crossOrigin = 'anonymous';
    prepareDomElement(data.image);
  }
  if (data.image.src !== source.src) data.image.src = source.src;
  applyDomStyle(state, data.image, renderProxy);
  applyDomSpriteSampling(state, data.image, renderProxy);
  setDomRendererElement(state, data.image);
}

function renderSpriteAsVideo(
  state: DomRenderState,
  renderProxy: RenderProxy2D,
  data: DomSpriteData,
  source: HTMLVideoElement,
): void {
  data.canvas = null;
  data.context = null;
  data.image = null;
  data.video = source;
  prepareDomElement(source);
  applyDomStyle(state, source, renderProxy);
  applyDomSpriteSampling(state, source, renderProxy);
  setDomRendererElement(state, source);
}

function applyDomSpriteSampling(state: DomRenderState, element: HTMLElement, renderProxy: RenderProxy2D): void {
  const texture = (renderProxy.source as Sprite).data.texture!;
  element.style.imageRendering =
    state.allowSmoothing && !texture.sampler.magFilter.startsWith('nearest') ? '' : 'pixelated';
}

export const defaultDomSpriteRenderer: Scene2DRenderer = {
  createData: createDomSpriteData,
  isDirty: isSpriteRendererDirty,
  submit: drawDomSprite,
};

const spriteViewSize = { x: 0, y: 0 };
