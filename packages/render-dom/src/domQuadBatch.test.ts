import { addTextureAtlasRegion, createImageSourceFromCanvas, createTextureAtlas } from '@flighthq/assets';
import { getSpriteRenderNode, registerRenderer } from '@flighthq/render-core';
import { createQuadBatch, resizeQuadBatch } from '@flighthq/scenegraph-sprite';
import { QuadBatchKind } from '@flighthq/types';

import { defaultDOMQuadBatchRenderer, drawDOMQuadBatch } from './domQuadBatch';
import { createDOMRenderState } from './domRenderState';

function makeState() {
  const container = document.createElement('div');
  const state = createDOMRenderState(container);
  registerRenderer(state, QuadBatchKind, defaultDOMQuadBatchRenderer);
  return state;
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

describe('drawDOMQuadBatch', () => {
  it('does nothing when atlas is null', () => {
    const state = makeState();
    const qb = createQuadBatch();
    qb.data.atlas = null;
    const renderNode = getSpriteRenderNode(state, qb);

    drawDOMQuadBatch(state, renderNode);

    expect(state.element.children.length).toBe(0);
  });

  it('does nothing when instanceCount is zero', () => {
    const state = makeState();
    const qb = createQuadBatch();
    qb.data.atlas = makeAtlas();
    qb.data.instanceCount = 0;
    const renderNode = getSpriteRenderNode(state, qb);

    drawDOMQuadBatch(state, renderNode);

    expect(state.element.children.length).toBe(0);
  });

  it('does nothing when rendererData is null', () => {
    const state = makeState();
    const qb = createQuadBatch();
    qb.data.atlas = makeAtlas();
    resizeQuadBatch(qb, 1);
    qb.data.ids[0] = 0;
    qb.data.transforms[0] = 0;
    qb.data.transforms[1] = 0;
    const renderNode = getSpriteRenderNode(state, qb);
    renderNode.rendererData = null;

    drawDOMQuadBatch(state, renderNode);

    expect(state.element.children.length).toBe(0);
  });

  it('appends a canvas when atlas and instances are valid', () => {
    const state = makeState();
    const qb = createQuadBatch();
    qb.data.atlas = makeAtlas();
    resizeQuadBatch(qb, 1);
    qb.data.ids[0] = 0;
    qb.data.transforms[0] = 10;
    qb.data.transforms[1] = 10;
    const renderNode = getSpriteRenderNode(state, qb);

    drawDOMQuadBatch(state, renderNode);

    expect(state.element.children.length).toBe(1);
    expect(state.element.children[0].tagName).toBe('CANVAS');
  });
});

describe('defaultDOMQuadBatchRenderer', () => {
  it('has draw and createData', () => {
    expect(typeof defaultDOMQuadBatchRenderer.draw).toBe('function');
    expect(typeof defaultDOMQuadBatchRenderer.createData).toBe('function');
  });
});
