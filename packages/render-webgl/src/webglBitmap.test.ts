import type { RenderProxy2D } from '@flighthq/types';
import { BatchFormat } from '@flighthq/types';

import { defaultWebGLBitmapRenderer, drawWebGLBitmap } from './webglBitmap';
import { registerDefaultWebGLMaterial } from './webglDefaultMaterial';
import { flushWebGLSpriteBatch } from './webglSpriteBatch';
import { makeWebGLState } from './webglTestHelper';

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

describe('defaultWebGLBitmapRenderer', () => {
  it('declares BatchFormat.Quad', () => {
    expect(defaultWebGLBitmapRenderer.format).toBe(BatchFormat.Quad);
  });

  it('has a createData function', () => {
    expect(typeof defaultWebGLBitmapRenderer.createData).toBe('function');
  });

  it('has a destroyData function', () => {
    expect(typeof defaultWebGLBitmapRenderer.destroyData).toBe('function');
  });

  it('has a submit function pointing to drawWebGLBitmap', () => {
    expect(defaultWebGLBitmapRenderer.submit).toBe(drawWebGLBitmap);
  });
});

describe('drawWebGLBitmap', () => {
  it('returns early without writing to batch when image is null', () => {
    const { state } = makeWebGLState();
    registerDefaultWebGLMaterial(state);
    drawWebGLBitmap(state, makeRenderProxy(null));
    expect(state.spriteBatchCount).toBe(0);
  });

  it('returns early without writing to batch when image.source is null', () => {
    const { state } = makeWebGLState();
    registerDefaultWebGLMaterial(state);
    drawWebGLBitmap(state, makeRenderProxy(makeImageResource(null)));
    expect(state.spriteBatchCount).toBe(0);
  });

  it('writes one instance to the sprite batch when image is valid', () => {
    const { state } = makeWebGLState();
    registerDefaultWebGLMaterial(state);
    const img = document.createElement('img');
    drawWebGLBitmap(state, makeRenderProxy(makeImageResource(img, 32, 32)));
    expect(state.spriteBatchCount).toBe(1);
  });

  it('draws via drawElementsInstanced after flush', () => {
    const { state, gl } = makeWebGLState();
    registerDefaultWebGLMaterial(state);
    const img = document.createElement('img');
    drawWebGLBitmap(state, makeRenderProxy(makeImageResource(img)));
    flushWebGLSpriteBatch(state as any);
    expect(gl.drawElementsInstanced).toHaveBeenCalled();
  });

  it('writes correct transform and size into instance data', () => {
    const { state } = makeWebGLState();
    registerDefaultWebGLMaterial(state);
    const img = document.createElement('img');
    drawWebGLBitmap(state, makeRenderProxy(makeImageResource(img, 64, 48)));
    const d = state.spriteBatchInstanceData;
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
    const { state } = makeWebGLState();
    registerDefaultWebGLMaterial(state);
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
    drawWebGLBitmap(state, proxy);
    const d = state.spriteBatchInstanceData;
    expect(d[6]).toBe(32); // width = sr.width
    expect(d[7]).toBe(16); // height = sr.height
    expect(d[8]).toBeCloseTo(16 / 128); // u0
    expect(d[9]).toBeCloseTo(8 / 64); // v0
    expect(d[10]).toBeCloseTo(48 / 128); // u1
    expect(d[11]).toBeCloseTo(24 / 64); // v1
  });
});
