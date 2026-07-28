import { getGlRenderStateRuntime, registerGlBitmapTextureResolver } from '@flighthq/render-gl/contract';
import { createTexture, setTextureUvFromPixelRect } from '@flighthq/texture/contract';
import type { Bitmap, RenderProxy2D, Sprite } from '@flighthq/types/contract';
import { BatchFormat, BitmapTextureBackingKind } from '@flighthq/types/contract';

import { flushGlQuadBatchWriter } from './glQuadBatchWriter';
import { defaultGlSpriteRenderer, drawGlSprite } from './glSprite';
import { registerStandardGlMaterial } from './glStandardMaterial';
import { createGlState } from './glTestHelper';

function makeSprite(width = 64, height = 48): Sprite {
  const image = {
    alphaType: 'straight',
    colorSpace: 'srgb',
    data: new Uint8ClampedArray(width * height * 4),
    format: 'rgba8unorm',
    height,
    kind: BitmapTextureBackingKind,
    version: 1,
    width,
  } as unknown as Bitmap;
  return {
    data: { texture: createTexture({ storage: { dimension: '2d', image } }) },
  } as Sprite;
}

function makeRenderProxy(sprite: Sprite): RenderProxy2D {
  return {
    alpha: 1,
    blendMode: 0,
    colorMatrix: null,
    colorScaleBias: null,
    material: null,
    materialData: null,
    source: sprite,
    transform2D: { a: 1, b: 0, c: 0, d: 1, tx: 10, ty: 20 },
  } as unknown as RenderProxy2D;
}

describe('defaultGlSpriteRenderer', () => {
  it('declares the quad format and submit function', () => {
    expect(defaultGlSpriteRenderer.format).toBe(BatchFormat.Quad);
    expect(defaultGlSpriteRenderer.submit).toBe(drawGlSprite);
  });
});

describe('drawGlSprite', () => {
  it('writes natural size and uv window into the shared batch', () => {
    const { state } = createGlState();
    registerGlBitmapTextureResolver(state);
    registerStandardGlMaterial(state);
    const sprite = makeSprite(128, 64);
    setTextureUvFromPixelRect(sprite.data.texture!, 16, 8, 32, 16);
    drawGlSprite(state, makeRenderProxy(sprite));
    const data = getGlRenderStateRuntime(state).quadBatchWriterInstanceData;
    expect(Array.from(data.slice(6, 12))).toEqual([32, 16, 0.125, 0.125, 0.375, 0.375]);
  });

  it('resolves and draws the texture on flush', () => {
    const { gl, state } = createGlState();
    registerGlBitmapTextureResolver(state);
    registerStandardGlMaterial(state);
    drawGlSprite(state, makeRenderProxy(makeSprite()));
    flushGlQuadBatchWriter(state);
    expect(gl.drawElementsInstanced).toHaveBeenCalledOnce();
  });
});
