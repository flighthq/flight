import { createImageResource } from '@flighthq/image/contract';
import { createQuadBatch, reserveQuadBatch } from '@flighthq/quadbatch/contract';
import { getOrCreateRenderProxy2D, prepareScene2DRender, registerRenderer } from '@flighthq/render/contract';
import {
  addTextureAtlasRegion,
  createTextureAtlas,
  createTextureAtlasFromImageResource,
} from '@flighthq/textureatlas/contract';
import { QuadBatchKind } from '@flighthq/types/contract';

import { registerCanvasImageTextureResolver } from './canvasImageTextureResolver';
import { defaultCanvasQuadBatchRenderer, drawCanvasQuadBatch } from './canvasQuadBatch';
import { getCanvasRenderStateTextureResolvers } from './canvasTestSupport';
import { createCanvasRenderState } from './canvasTestSupport';

function makeAtlas(regionCount = 1) {
  const img = document.createElement('img') as HTMLImageElement;
  const source = createImageResource(img);
  source.width = 128;
  source.height = 128;
  const atlas = createTextureAtlasFromImageResource(source);
  for (let i = 0; i < regionCount; i++) {
    addTextureAtlasRegion(atlas, i * 32, 0, 32, 32);
  }
  return atlas;
}

function makeState() {
  const canvas = document.createElement('canvas');
  canvas.width = 400;
  canvas.height = 400;
  const state = createCanvasRenderState(canvas);
  registerCanvasImageTextureResolver(getCanvasRenderStateTextureResolvers(state));
  registerRenderer(state, QuadBatchKind, defaultCanvasQuadBatchRenderer);
  return state;
}

describe('defaultCanvasQuadBatchRenderer', () => {
  it('has submit and createData', () => {
    expect(typeof defaultCanvasQuadBatchRenderer.submit).toBe('function');
    expect(typeof defaultCanvasQuadBatchRenderer.createData).toBe('function');
  });
});

describe('drawCanvasQuadBatch', () => {
  it('skips draw when atlas is null', () => {
    const state = makeState();
    const qb = createQuadBatch();
    reserveQuadBatch(qb, 1);
    qb.data.instanceCount = 1;
    qb.data.atlas = null;

    prepareScene2DRender(state, qb);
    const renderProxy = getOrCreateRenderProxy2D(state, qb);
    const spy = vi.spyOn(state.context, 'drawImage');

    drawCanvasQuadBatch(state, renderProxy);

    expect(spy).not.toHaveBeenCalled();
  });

  it('draws each instance with correct region', () => {
    const state = makeState();
    const atlas = makeAtlas(2);
    const qb = createQuadBatch();
    qb.data.atlas = atlas;
    reserveQuadBatch(qb, 2);
    qb.data.instanceCount = 2;
    qb.data.ids[0] = 0;
    qb.data.ids[1] = 1;
    qb.data.transforms[0] = 10;
    qb.data.transforms[1] = 20;
    qb.data.transforms[2] = 30;
    qb.data.transforms[3] = 40;

    prepareScene2DRender(state, qb);
    const renderProxy = getOrCreateRenderProxy2D(state, qb);
    const spy = vi.spyOn(state.context, 'drawImage');

    drawCanvasQuadBatch(state, renderProxy);

    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('skips instances with out-of-range id', () => {
    const state = makeState();
    const atlas = makeAtlas(1);
    const qb = createQuadBatch();
    qb.data.atlas = atlas;
    reserveQuadBatch(qb, 1);
    qb.data.instanceCount = 1;
    qb.data.ids[0] = 99; // out of range

    prepareScene2DRender(state, qb);
    const renderProxy = getOrCreateRenderProxy2D(state, qb);
    const spy = vi.spyOn(state.context, 'drawImage');

    drawCanvasQuadBatch(state, renderProxy);

    expect(spy).not.toHaveBeenCalled();
  });

  it('skips instances with zero-size region', () => {
    const state = makeState();
    const img = document.createElement('img') as HTMLImageElement;
    const source = createImageResource(img);
    source.width = 128;
    source.height = 128;
    const atlas = createTextureAtlasFromImageResource(source);
    addTextureAtlasRegion(atlas, 0, 0, 0, 0); // zero size

    const qb = createQuadBatch();
    qb.data.atlas = atlas;
    reserveQuadBatch(qb, 1);
    qb.data.instanceCount = 1;
    qb.data.ids[0] = 0;

    prepareScene2DRender(state, qb);
    const renderProxy = getOrCreateRenderProxy2D(state, qb);
    const spy = vi.spyOn(state.context, 'drawImage');

    drawCanvasQuadBatch(state, renderProxy);

    expect(spy).not.toHaveBeenCalled();
  });
});
