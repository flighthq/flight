import {
  createImageResource,
  registerTestImageDimensionResolver,
  unregisterTestImageDimensionResolver,
} from '@flighthq/image/contract';
import { getOrCreateRenderProxy2D, prepareScene2DRender, registerRenderer } from '@flighthq/render/contract';
import { createSprite } from '@flighthq/scene2d/contract';
import {
  createPixelArtSampler,
  createRenderTexture,
  createTexture,
  setTextureUvFromPixelRect,
} from '@flighthq/texture/contract';
import { SpriteKind } from '@flighthq/types/contract';

import { registerCanvasImageTextureResolver } from './canvasImageTextureResolver';
import { renderIntoCanvasRenderTexture } from './canvasRenderTexture';
import { registerCanvasRenderTextureResolver } from './canvasRenderTextureResolver';
import { defaultCanvasSpriteRenderer, drawCanvasSprite } from './canvasSprite';
import { getCanvasRenderStateTextureResolvers } from './canvasTestSupport';
import { createCanvasRenderState } from './canvasTestSupport';

// A test that wraps a host handle supplies the host: the resource measures through the registered
// resolver, and clearing after each test keeps this file from covering for another's missing one.
beforeEach(() => {
  registerTestImageDimensionResolver();
});

afterEach(() => {
  unregisterTestImageDimensionResolver();
});

function makeState() {
  const state = createCanvasRenderState(document.createElement('canvas'));
  registerCanvasImageTextureResolver(getCanvasRenderStateTextureResolvers(state));
  registerCanvasRenderTextureResolver(getCanvasRenderStateTextureResolvers(state), state);
  registerRenderer(state, SpriteKind, defaultCanvasSpriteRenderer);
  return state;
}

function makeTexture() {
  const image = createImageResource(globalThis.document.createElement('img'));
  image.width = 64;
  image.height = 64;
  return createTexture({ dimension: '2d', source: image });
}

describe('defaultCanvasSpriteRenderer', () => {
  it('installs the sprite identity dirty hook with submit and renderer data', () => {
    expect(typeof defaultCanvasSpriteRenderer.submit).toBe('function');
    expect(typeof defaultCanvasSpriteRenderer.createData).toBe('function');
    expect(typeof defaultCanvasSpriteRenderer.isDirty).toBe('function');
  });

  it('dirties requiresInvalidation preparation after a same-size bare texture assignment', () => {
    const state = createCanvasRenderState(document.createElement('canvas'), {
      sceneGraphSyncPolicy: 'requiresInvalidation',
    });
    registerRenderer(state, SpriteKind, defaultCanvasSpriteRenderer);
    const sprite = createSprite({ data: { texture: makeTexture() } });
    prepareScene2DRender(state, sprite);
    expect(prepareScene2DRender(state, sprite)).toBe(false);

    sprite.data.texture = makeTexture();

    expect(prepareScene2DRender(state, sprite)).toBe(true);
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

  it('draws a populated render Texture through the same Sprite path', () => {
    const state = makeState();
    const texture = createRenderTexture({ height: 24, width: 48 });
    renderIntoCanvasRenderTexture(state, state, texture, () => {});
    const draw = vi.spyOn(state.context, 'drawImage');
    drawCanvasSprite(state, getOrCreateRenderProxy2D(state, createSprite({ data: { texture } })));
    expect(draw).toHaveBeenCalledOnce();
    expect(draw.mock.calls[0].slice(1, 5)).toEqual([0, 0, 48, 24]);
  });

  it('draws a packed quarter-turn directly without allocating a window surface', () => {
    const state = makeState();
    const image = createImageResource(globalThis.document.createElement('canvas'));
    image.width = 100;
    image.height = 50;
    const texture = createTexture({ dimension: '2d', source: image });
    texture.uvOffset.x = 0.1;
    texture.uvOffset.y = 0.4;
    texture.uvScale.x = 0.3;
    texture.uvScale.y = 0.2;
    texture.uvRotation = -Math.PI / 2;
    const draw = vi.spyOn(state.context, 'drawImage');
    const transform = vi.spyOn(state.context, 'transform');
    const createElement = vi.spyOn(document, 'createElement');

    drawCanvasSprite(state, getOrCreateRenderProxy2D(state, createSprite({ data: { texture } })));

    expect(draw).toHaveBeenCalledOnce();
    const args = draw.mock.calls[0].slice(1) as number[];
    expect(args[0]).toBeCloseTo(10);
    expect(args[1]).toBeCloseTo(5);
    [20, 15, 10, 5, 20, 15].forEach((expected, index) => expect(args[index + 2]).toBeCloseTo(expected));
    expect(transform).toHaveBeenCalledOnce();
    expect(createElement).not.toHaveBeenCalled();
  });
});
