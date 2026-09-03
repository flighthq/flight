import {
  getGlRenderStateRuntime,
  registerGlBitmapTextureResolver,
  registerGlRenderTextureResolver,
  renderIntoGlRenderTexture,
} from '@flighthq/render-gl/contract';
import { createRenderTexture, createTexture, setTextureUvFromPixelRect } from '@flighthq/texture/contract';
import type { Bitmap, ColorScaleBias, RenderProxy2D, Sprite } from '@flighthq/types/contract';
import { BatchFormat, BitmapTextureSourceKind } from '@flighthq/types/contract';

import { registerGlColorAdjustmentMaterialFeature } from './glColorAdjustmentMaterialFeature';
import { flushGlQuadBatchWriter } from './glQuadBatchWriter';
import { defaultGlSpriteRenderer, drawGlSprite } from './glSprite';
import { registerGlStandardMaterial } from './glStandardMaterial';
import { createGlState } from './glTestHelper';

function makeSprite(width = 64, height = 48): Sprite {
  const image = {
    alphaType: 'straight',
    colorSpace: 'srgb',
    data: new Uint8ClampedArray(width * height * 4),
    format: 'rgba8unorm',
    height,
    kind: BitmapTextureSourceKind,
    version: 1,
    width,
  } as unknown as Bitmap;
  return {
    data: { texture: createTexture({ dimension: '2d', source: image }) },
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

function ct(scale: number): ColorScaleBias {
  return {
    alphaBias: 0,
    alphaScale: 1,
    blueBias: 0,
    blueScale: scale,
    greenBias: 0,
    greenScale: scale,
    redBias: 0,
    redScale: scale,
  } as ColorScaleBias;
}

const CT_MODE_UNIFORM = 1;

describe('defaultGlSpriteRenderer', () => {
  it('declares the quad format and submit function', () => {
    expect(defaultGlSpriteRenderer.format).toBe(BatchFormat.Quad);
    expect(typeof defaultGlSpriteRenderer.isDirty).toBe('function');
    expect(defaultGlSpriteRenderer.submit).toBe(drawGlSprite);
  });
});

describe('drawGlSprite', () => {
  it('writes natural size and uv window into the shared batch', () => {
    const { state } = createGlState();
    registerGlBitmapTextureResolver(state);
    registerGlStandardMaterial(state);
    const sprite = makeSprite(128, 64);
    setTextureUvFromPixelRect(sprite.data.texture!, 16, 8, 32, 16);
    drawGlSprite(state, makeRenderProxy(sprite));
    const data = getGlRenderStateRuntime(state).quadBatchWriterInstanceData;
    expect(Array.from(data.slice(6, 12))).toEqual([32, 16, 0.125, 0.125, 0.375, 0.375]);
  });

  it('uses the physical slab once and reflects a render-target sub-view into GL coordinates', () => {
    const { state } = createGlState();
    registerGlRenderTextureResolver(state);
    registerGlStandardMaterial(state);
    const renderTexture = createRenderTexture({ height: 480, width: 720 });
    setTextureUvFromPixelRect(renderTexture, 140, 160, 100, 80);
    renderIntoGlRenderTexture(state, renderTexture, () => {});
    const sprite = { data: { texture: renderTexture } } as Sprite;

    drawGlSprite(state, makeRenderProxy(sprite));

    const data = getGlRenderStateRuntime(state).quadBatchWriterInstanceData;
    expect(data.slice(6, 12)).toEqual(new Float32Array([100, 80, 140 / 720, 1 - 160 / 480, 240 / 720, 1 - 240 / 480]));
  });

  it('records a tint against the instance the flush uploads when a new texture breaks the batch', () => {
    const { state } = createGlState();
    registerGlBitmapTextureResolver(state);
    registerGlStandardMaterial(state);
    registerGlColorAdjustmentMaterialFeature(state);
    const runtime = getGlRenderStateRuntime(state);

    drawGlSprite(state, makeRenderProxy(makeSprite(32, 32)));
    expect(runtime.quadBatchWriterCount).toBe(1);

    const tinted = makeRenderProxy(makeSprite(16, 16));
    (tinted as { colorScaleBias: ColorScaleBias }).colorScaleBias = ct(0.5);
    drawGlSprite(state, tinted);

    expect(runtime.quadBatchWriterCount).toBe(1);
    expect(runtime.quadBatchWriterColorScaleBiasMode).toBe(CT_MODE_UNIFORM);
  });

  it('resolves and draws the texture on flush', () => {
    const { gl, state } = createGlState();
    registerGlBitmapTextureResolver(state);
    registerGlStandardMaterial(state);
    drawGlSprite(state, makeRenderProxy(makeSprite()));
    flushGlQuadBatchWriter(state);
    expect(gl.drawElementsInstanced).toHaveBeenCalledOnce();
  });
});
