import { createImageResource, createImageResourceFromCanvas } from '@flighthq/image/contract';
import { getOrCreateRenderProxy2D, registerRenderer } from '@flighthq/render/contract';
import { createSprite } from '@flighthq/scene2d/contract';
import { createTexture } from '@flighthq/texture/contract';
import { SpriteKind, VideoTextureBackingKind } from '@flighthq/types/contract';

import { createDomRenderState, getDomRenderStateRuntime } from './domRenderState';
import { defaultDomSpriteRenderer, drawDomSprite } from './domSprite';

function drawElement(source: CanvasImageSource, kind = 'image'): HTMLElement | null {
  const state = createDomRenderState(document.createElement('div'));
  registerRenderer(state, SpriteKind, defaultDomSpriteRenderer);
  const image = createImageResource(source);
  image.kind = kind;
  image.width = 64;
  image.height = 64;
  const sprite = createSprite({
    data: { texture: createTexture({ storage: { dimension: '2d', image } }) },
  });
  drawDomSprite(state, getOrCreateRenderProxy2D(state, sprite));
  return getDomRenderStateRuntime(state).domCurrentElement;
}

describe('defaultDomSpriteRenderer', () => {
  it('has submit and createData functions', () => {
    expect(typeof defaultDomSpriteRenderer.createData).toBe('function');
    expect(defaultDomSpriteRenderer.submit).toBe(drawDomSprite);
  });
});

describe('drawDomSprite', () => {
  it('renders an image texture as an img element', () => {
    const image = document.createElement('img');
    image.src = 'test.png';
    expect(drawElement(image)?.tagName).toBe('IMG');
  });

  it('renders a canvas-backed texture as a canvas element', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const image = createImageResourceFromCanvas(canvas);
    const state = createDomRenderState(document.createElement('div'));
    registerRenderer(state, SpriteKind, defaultDomSpriteRenderer);
    const sprite = createSprite({
      data: { texture: createTexture({ storage: { dimension: '2d', image } }) },
    });
    drawDomSprite(state, getOrCreateRenderProxy2D(state, sprite));
    expect(getDomRenderStateRuntime(state).domCurrentElement?.tagName).toBe('CANVAS');
  });

  it('uses the backing video element directly', () => {
    expect(drawElement(document.createElement('video'), VideoTextureBackingKind)?.tagName).toBe('VIDEO');
  });
});
