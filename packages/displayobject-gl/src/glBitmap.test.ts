import { getGlRenderStateRuntime } from '@flighthq/render-gl';
import type { RenderProxy2D } from '@flighthq/types';
import { BatchFormat } from '@flighthq/types';

import { defaultGlBitmapRenderer, drawGlBitmap } from './glBitmap';
import { registerDefaultGlMaterial } from './glDefaultMaterial';
import { flushGlSpriteBatch } from './glSpriteBatch';
import { createGlState } from './glTestHelper';

function makeBitmapData() {
  return { lastSrc: null, lastVersion: -1 };
}

function makeRenderProxy(image: unknown = null, rendererData: unknown = makeBitmapData()): RenderProxy2D {
  return {
    source: { data: { image } },
    blendMode: 0,
    alpha: 1,
    material: null,
    materialData: null,
    transform2D: { a: 1, b: 0, c: 0, d: 1, tx: 10, ty: 20 },
    rendererData,
  } as unknown as RenderProxy2D;
}

function makeImageResource(source: unknown = null, width = 32, height = 32) {
  return { source, width, height };
}

describe('defaultGlBitmapRenderer', () => {
  it('declares BatchFormat.Quad', () => {
    expect(defaultGlBitmapRenderer.format).toBe(BatchFormat.Quad);
  });

  it('has a createData function', () => {
    expect(typeof defaultGlBitmapRenderer.createData).toBe('function');
  });

  it('has a destroyData function', () => {
    expect(typeof defaultGlBitmapRenderer.destroyData).toBe('function');
  });

  it('has a submit function pointing to drawGlBitmap', () => {
    expect(defaultGlBitmapRenderer.submit).toBe(drawGlBitmap);
  });
});

describe('drawGlBitmap', () => {
  it('returns early without writing to batch when image is null', () => {
    const { state } = createGlState();
    registerDefaultGlMaterial(state);
    drawGlBitmap(state, makeRenderProxy(null));
    expect(getGlRenderStateRuntime(state).spriteBatchCount).toBe(0);
  });

  it('returns early without writing to batch when image.source is null', () => {
    const { state } = createGlState();
    registerDefaultGlMaterial(state);
    drawGlBitmap(state, makeRenderProxy(makeImageResource(null)));
    expect(getGlRenderStateRuntime(state).spriteBatchCount).toBe(0);
  });

  it('writes one instance to the sprite batch when image is valid', () => {
    const { state } = createGlState();
    registerDefaultGlMaterial(state);
    const img = document.createElement('img');
    drawGlBitmap(state, makeRenderProxy(makeImageResource(img, 32, 32)));
    expect(getGlRenderStateRuntime(state).spriteBatchCount).toBe(1);
  });

  it('draws via drawElementsInstanced after flush', () => {
    const { state, gl } = createGlState();
    registerDefaultGlMaterial(state);
    const img = document.createElement('img');
    drawGlBitmap(state, makeRenderProxy(makeImageResource(img)));
    flushGlSpriteBatch(state as any);
    expect(gl.drawElementsInstanced).toHaveBeenCalled();
  });

  it('writes correct transform and size into instance data', () => {
    const { state } = createGlState();
    registerDefaultGlMaterial(state);
    const img = document.createElement('img');
    drawGlBitmap(state, makeRenderProxy(makeImageResource(img, 64, 48)));
    const d = getGlRenderStateRuntime(state).spriteBatchInstanceData;
    expect(d[0]).toBe(1); // a
    expect(d[1]).toBe(0); // b
    expect(d[2]).toBe(0); // c
    expect(d[3]).toBe(1); // d
    expect(d[4]).toBe(10); // tx
    expect(d[5]).toBe(20); // ty
    expect(d[6]).toBe(64); // width
    expect(d[7]).toBe(48); // height
    expect(d[8]).toBeCloseTo(0); // u0
    expect(d[9]).toBeCloseTo(0); // v0
    expect(d[10]).toBeCloseTo(1); // u1
    expect(d[11]).toBeCloseTo(1); // v1
    expect(d[12]).toBe(1); // alpha
  });

  it('writes source-rectangle UVs when sourceRectangle is set', () => {
    const { state } = createGlState();
    registerDefaultGlMaterial(state);
    const img = document.createElement('img');
    const proxy = {
      ...makeRenderProxy({
        source: img,
        width: 128,
        height: 64,
        sourceRectangle: { x: 16, y: 8, width: 32, height: 16 },
      }),
      source: {
        data: {
          image: { source: img, width: 128, height: 64 },
          sourceRectangle: { x: 16, y: 8, width: 32, height: 16 },
        },
      },
    } as unknown as RenderProxy2D;
    drawGlBitmap(state, proxy);
    const d = getGlRenderStateRuntime(state).spriteBatchInstanceData;
    expect(d[6]).toBe(32); // width = sr.width
    expect(d[7]).toBe(16); // height = sr.height
    expect(d[8]).toBeCloseTo(16 / 128); // u0
    expect(d[9]).toBeCloseTo(8 / 64); // v0
    expect(d[10]).toBeCloseTo(48 / 128); // u1
    expect(d[11]).toBeCloseTo(24 / 64); // v1
  });
});
