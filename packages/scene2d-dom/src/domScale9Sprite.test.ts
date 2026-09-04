import { createImageResourceFromCanvas } from '@flighthq/image/contract';
import { getOrCreateRenderProxy2D, registerRenderer } from '@flighthq/render/contract';
import { createScale9Sprite } from '@flighthq/scene2d/contract';
import { createTexture } from '@flighthq/texture/contract';
import { Scale9SpriteKind } from '@flighthq/types/contract';

import { registerDomImageTextureResolver } from './domImageTextureResolver';
import { createDomRenderState, getDomRenderStateRuntime } from './domRenderState';
import {
  createDomScale9SpriteData,
  defaultDomScale9SpriteRenderer,
  drawDomScale9Sprite,
  initializeDomScale9SpriteData,
} from './domScale9Sprite';

describe('createDomScale9SpriteData', () => {
  it('creates renderer data', () => {
    expect(typeof createDomScale9SpriteData).toBe('function');
  });
});

describe('defaultDomScale9SpriteRenderer', () => {
  it('exposes renderer data and submit function', () => {
    expect(typeof createDomScale9SpriteData).toBe('function');
    expect(defaultDomScale9SpriteRenderer.submit).toBe(drawDomScale9Sprite);
  });
});

describe('drawDomScale9Sprite', () => {
  it('renders nine leaf canvas pieces and strips node scale from the wrapper transform', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;
    const state = createDomRenderState(document.createElement('div'));
    registerDomImageTextureResolver(state);
    registerRenderer(state, Scale9SpriteKind, defaultDomScale9SpriteRenderer);
    const sprite = createScale9Sprite(
      { x: 20, y: 20, width: 60, height: 60 },
      {
        data: { texture: createTexture({ dimension: '2d', source: createImageResourceFromCanvas(canvas) }) },
        scaleX: 2,
        scaleY: 2,
      },
    );
    drawDomScale9Sprite(state, getOrCreateRenderProxy2D(state, sprite));
    const element = getDomRenderStateRuntime(state).domCurrentElement;
    expect(element?.children).toHaveLength(9);
    expect(element?.style.width).toBe('200px');
  });
});
describe('initializeDomScale9SpriteData', () => {
  it('is the construction initializer of createDomScale9SpriteData', () => {
    expect(typeof initializeDomScale9SpriteData).toBe('function');
  });
});
