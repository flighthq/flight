import { createSpriteRendererData, isSpriteRendererDirty } from '@flighthq/scene2d/contract';
import { getTextureHeight, getTextureWidth } from '@flighthq/texture/contract';
import type {
  DomRenderState,
  Renderable,
  RendererData,
  RenderProxy2D,
  RenderState,
  Scene2DRenderer,
  Sprite,
} from '@flighthq/types/contract';

import { applyDomStyle, prepareDomElement, setDomRendererElement } from './domStyle';
import { resolveDomTexture } from './domTextureResolver';

interface DomSpriteData extends RendererData {
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
  const sourceRectangle = {
    height: Math.abs(texture.uvScale.y * textureHeight),
    width: Math.abs(texture.uvScale.x * textureWidth),
    x: texture.uvOffset.x * textureWidth,
    y: texture.uvOffset.y * textureHeight,
  };
  const isFullTexture =
    sourceRectangle.x === 0 &&
    sourceRectangle.y === 0 &&
    sourceRectangle.width === textureWidth &&
    sourceRectangle.height === textureHeight;

  if (isFullTexture && source instanceof HTMLVideoElement) {
    renderSpriteAsVideo(state, renderProxy, data, source);
  } else if (isFullTexture && source instanceof HTMLImageElement) {
    renderSpriteAsImage(state, renderProxy, data, source);
  } else {
    renderSpriteAsCanvas(state, renderProxy, data, source, sourceRectangle);
  }
}

function renderSpriteAsCanvas(
  state: DomRenderState,
  renderProxy: RenderProxy2D,
  data: DomSpriteData,
  source: CanvasImageSource,
  sourceRectangle: { x: number; y: number; width: number; height: number },
): void {
  data.image = null;
  data.video = null;
  if (data.canvas === null) {
    data.canvas = document.createElement('canvas');
    data.context = data.canvas.getContext('2d');
    prepareDomElement(data.canvas);
  }

  const texture = (renderProxy.source as Sprite).data.texture!;
  const pixelRatio = state.pixelRatio;
  data.canvas.width = sourceRectangle.width * pixelRatio;
  data.canvas.height = sourceRectangle.height * pixelRatio;
  data.canvas.style.width = `${sourceRectangle.width}px`;
  data.canvas.style.height = `${sourceRectangle.height}px`;

  const context = data.context!;
  if (pixelRatio !== 1) context.scale(pixelRatio, pixelRatio);
  context.imageSmoothingEnabled = state.allowSmoothing && !texture.sampler.magFilter.startsWith('nearest');
  context.drawImage(
    source,
    sourceRectangle.x,
    sourceRectangle.y,
    sourceRectangle.width,
    sourceRectangle.height,
    0,
    0,
    sourceRectangle.width,
    sourceRectangle.height,
  );
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
