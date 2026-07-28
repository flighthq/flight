import { createImageResource } from '@flighthq/image/contract';
import { getOrCreateRenderProxy2D, registerRenderer } from '@flighthq/render/contract';
import { createSprite } from '@flighthq/scene2d/contract';
import {
  createPixelArtSampler,
  createRenderTexture,
  createTexture,
  setTextureUvFromPixelRect,
} from '@flighthq/texture/contract';
import { SpriteKind } from '@flighthq/types/contract';

import { registerCanvasImageTextureResolver, registerCanvasProducedTextureResolver } from './canvasImageSource';
import { createCanvasRenderState } from './canvasRenderState';
import { renderIntoCanvasRenderTexture } from './canvasRenderTexture';
import { defaultCanvasSpriteRenderer, drawCanvasSprite } from './canvasSprite';

function makeState() {
  const state = createCanvasRenderState(document.createElement('canvas'));
  registerCanvasImageTextureResolver(state);
  registerCanvasProducedTextureResolver(state);
  registerRenderer(state, SpriteKind, defaultCanvasSpriteRenderer);
  return state;
}

function makeTexture() {
  const image = createImageResource(document.createElement('img'));
  image.width = 64;
  image.height = 64;
  return createTexture({ storage: { dimension: '2d', image } });
}

describe('defaultCanvasSpriteRenderer', () => {
  it('has submit and createData', () => {
    expect(typeof defaultCanvasSpriteRenderer.submit).toBe('function');
    expect(typeof defaultCanvasSpriteRenderer.createData).toBe('function');
  });
});

describe('drawCanvasSprite', () => {
  it('draws the texture uv window', () => {
    const state = makeState();
    const texture = makeTexture();
    setTextureUvFromPixelRect(texture, 10, 20, 32, 16);
    const sprite = createSprite({ data: { texture } });
    const draw = vi.spyOn(state.context, 'drawImage');
    drawCanvasSprite(state, getOrCreateRenderProxy2D(state, sprite));
    expect(draw).toHaveBeenCalledOnce();
    expect(draw.mock.calls[0].slice(1, 5)).toEqual([10, 20, 32, 16]);
  });

  it('honors nearest filtering and restores canvas smoothing', () => {
    const state = makeState();
    const texture = makeTexture();
    texture.sampler = createPixelArtSampler();
    drawCanvasSprite(state, getOrCreateRenderProxy2D(state, createSprite({ data: { texture } })));
    expect(state.context.imageSmoothingEnabled).toBe(true);
  });

  it('draws a populated produced Texture through the same Sprite path', () => {
    const state = makeState();
    const texture = createRenderTexture({ height: 24, width: 48 });
    renderIntoCanvasRenderTexture(state, texture, () => {});
    const draw = vi.spyOn(state.context, 'drawImage');
    drawCanvasSprite(state, getOrCreateRenderProxy2D(state, createSprite({ data: { texture } })));
    expect(draw).toHaveBeenCalledOnce();
    expect(draw.mock.calls[0].slice(1, 5)).toEqual([0, 0, 48, 24]);
  });
});
