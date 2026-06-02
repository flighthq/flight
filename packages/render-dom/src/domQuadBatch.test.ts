import { addTextureAtlasRegion, createImageSourceFromCanvas, createTextureAtlas } from '@flighthq/assets';
import { registerRenderer } from '@flighthq/render-core';
import { getOrCreateSpriteRenderNode } from '@flighthq/render-tree';
import { createQuadBatch, resizeQuadBatch } from '@flighthq/scene-sprite';
import { QuadBatchKind } from '@flighthq/types';

import { defaultDOMQuadBatchRenderer, drawDOMQuadBatch } from './domQuadBatch';
import { createDOMRenderState } from './domRenderState';
import type { DOMRenderStateInternal } from './internal';

function makeState() {
  const container = document.createElement('div');
  const state = createDOMRenderState(container);
  registerRenderer(state, QuadBatchKind, defaultDOMQuadBatchRenderer);
  return state;
}

function drawGetEl(state: ReturnType<typeof makeState>, drawFn: () => void): HTMLElement | null {
  (state as unknown as DOMRenderStateInternal).domCurrentElement = null;
  drawFn();
  return (state as unknown as DOMRenderStateInternal).domCurrentElement;
}

function makeAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const image = createImageSourceFromCanvas(canvas);
  const atlas = createTextureAtlas({ image });
  addTextureAtlasRegion(atlas, 0, 0, 32, 32);
  return atlas;
}

describe('defaultDOMQuadBatchRenderer', () => {
  it('has draw and createData', () => {
    expect(typeof defaultDOMQuadBatchRenderer.draw).toBe('function');
    expect(typeof defaultDOMQuadBatchRenderer.createData).toBe('function');
  });
});

describe('drawDOMQuadBatch', () => {
  it('does nothing when atlas is null', () => {
    const state = makeState();
    const qb = createQuadBatch();
    qb.data.atlas = null;
    const renderNode = getOrCreateSpriteRenderNode(state, qb);

    const el = drawGetEl(state, () => drawDOMQuadBatch(state, renderNode));

    expect(el).toBeNull();
  });

  it('does nothing when instanceCount is zero', () => {
    const state = makeState();
    const qb = createQuadBatch();
    qb.data.atlas = makeAtlas();
    qb.data.instanceCount = 0;
    const renderNode = getOrCreateSpriteRenderNode(state, qb);

    const el = drawGetEl(state, () => drawDOMQuadBatch(state, renderNode));

    expect(el).toBeNull();
  });

  it('does nothing when rendererData is null', () => {
    const state = makeState();
    const qb = createQuadBatch();
    qb.data.atlas = makeAtlas();
    resizeQuadBatch(qb, 1);
    qb.data.ids[0] = 0;
    qb.data.transforms[0] = 0;
    qb.data.transforms[1] = 0;
    const renderNode = getOrCreateSpriteRenderNode(state, qb);
    renderNode.rendererData = null;

    const el = drawGetEl(state, () => drawDOMQuadBatch(state, renderNode));

    expect(el).toBeNull();
  });

  it('produces a canvas when atlas and instances are valid', () => {
    const state = makeState();
    const qb = createQuadBatch();
    qb.data.atlas = makeAtlas();
    resizeQuadBatch(qb, 1);
    qb.data.ids[0] = 0;
    qb.data.transforms[0] = 10;
    qb.data.transforms[1] = 10;
    const renderNode = getOrCreateSpriteRenderNode(state, qb);

    const el = drawGetEl(state, () => drawDOMQuadBatch(state, renderNode));

    expect(el).not.toBeNull();
    expect(el!.tagName).toBe('CANVAS');
  });
});
