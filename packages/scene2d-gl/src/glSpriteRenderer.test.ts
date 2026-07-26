import { getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import type { RenderProxy2D } from '@flighthq/types/contract';

import { flushGlSpriteBatch } from './glSpriteBatch';
import { defaultGlSpriteRenderer } from './glSpriteRenderer';
import { registerStandardGlMaterial } from './glStandardMaterial';
import { createGlState } from './glTestHelper';

function makeAtlas(regionWidth = 32, regionHeight = 32, pivotX: number | null = null, pivotY: number | null = null) {
  const img = document.createElement('img');
  return {
    image: { source: img, width: 64, height: 64 },
    regions: [{ x: 0, y: 0, width: regionWidth, height: regionHeight, pivotX, pivotY }],
  };
}

function makeSpriteNode(data: Record<string, unknown> = {}): RenderProxy2D {
  return {
    source: { data: { atlas: null, id: 0, ...data } },
    blendMode: 0,
    alpha: 1,
    material: null,
    materialData: null,
    renderer: null,
    traverseChildren: false,
    transform2D: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
  } as unknown as RenderProxy2D;
}

describe('defaultGlSpriteRenderer', () => {
  it('has a createData function', () => {
    expect(typeof defaultGlSpriteRenderer.createData).toBe('function');
  });

  it('has a submit function', () => {
    expect(typeof defaultGlSpriteRenderer.submit).toBe('function');
  });
});

describe('defaultGlSpriteRenderer.submit', () => {
  it('returns early without drawing when atlas is null', () => {
    const { state, gl } = createGlState();
    defaultGlSpriteRenderer.submit(state, makeSpriteNode({ atlas: null }));
    flushGlSpriteBatch(state);
    expect(gl.drawElementsInstanced).not.toHaveBeenCalled();
  });

  it('returns early without drawing when atlas.image is null', () => {
    const { state, gl } = createGlState();
    defaultGlSpriteRenderer.submit(state, makeSpriteNode({ atlas: { image: null, regions: [] } }));
    flushGlSpriteBatch(state);
    expect(gl.drawElementsInstanced).not.toHaveBeenCalled();
  });

  it('returns early without drawing when id is negative', () => {
    const { state, gl } = createGlState();
    defaultGlSpriteRenderer.submit(state, makeSpriteNode({ atlas: makeAtlas(), id: -1 }));
    flushGlSpriteBatch(state);
    expect(gl.drawElementsInstanced).not.toHaveBeenCalled();
  });

  it('returns early without drawing when region width is zero', () => {
    const { state, gl } = createGlState();
    defaultGlSpriteRenderer.submit(state, makeSpriteNode({ atlas: makeAtlas(0, 32), id: 0 }));
    flushGlSpriteBatch(state);
    expect(gl.drawElementsInstanced).not.toHaveBeenCalled();
  });

  it('draws a quad when the atlas region is valid', () => {
    const { state, gl } = createGlState();
    registerStandardGlMaterial(state);
    defaultGlSpriteRenderer.submit(state, makeSpriteNode({ atlas: makeAtlas(), id: 0 }));
    flushGlSpriteBatch(state);
    expect(gl.drawElementsInstanced).toHaveBeenCalledWith(expect.anything(), 6, expect.anything(), 0, 1);
  });

  it('folds the region pivot through the sprite transform into batch translation', () => {
    const { state } = createGlState();
    registerStandardGlMaterial(state);
    const node = makeSpriteNode({ atlas: makeAtlas(32, 32, 7, 9), id: 0 });
    Object.assign(node.transform2D, { a: 2, b: 3, c: 4, d: 5, tx: 100, ty: 200 });

    defaultGlSpriteRenderer.submit(state, node);

    const data = getGlRenderStateRuntime(state).spriteBatchInstanceData;
    expect(data[4]).toBe(50);
    expect(data[5]).toBe(134);
  });
});
