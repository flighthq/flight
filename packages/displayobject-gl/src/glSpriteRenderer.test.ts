import { makeGlState } from '@flighthq/render-gl';
import type { RenderProxy2D } from '@flighthq/types';

import { registerDefaultGlMaterial } from './glDefaultMaterial';
import { flushGlSpriteBatch } from './glSpriteBatch';
import { defaultGlSpriteRenderer } from './glSpriteRenderer';

function makeAtlas(regionWidth = 32, regionHeight = 32) {
  const img = document.createElement('img');
  return {
    image: { source: img, width: 64, height: 64 },
    regions: [{ x: 0, y: 0, width: regionWidth, height: regionHeight }],
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
    const { state, gl } = makeGlState();
    defaultGlSpriteRenderer.submit(state, makeSpriteNode({ atlas: null }));
    flushGlSpriteBatch(state);
    expect(gl.drawElementsInstanced).not.toHaveBeenCalled();
  });

  it('returns early without drawing when atlas.image is null', () => {
    const { state, gl } = makeGlState();
    defaultGlSpriteRenderer.submit(state, makeSpriteNode({ atlas: { image: null, regions: [] } }));
    flushGlSpriteBatch(state);
    expect(gl.drawElementsInstanced).not.toHaveBeenCalled();
  });

  it('returns early without drawing when id is negative', () => {
    const { state, gl } = makeGlState();
    defaultGlSpriteRenderer.submit(state, makeSpriteNode({ atlas: makeAtlas(), id: -1 }));
    flushGlSpriteBatch(state);
    expect(gl.drawElementsInstanced).not.toHaveBeenCalled();
  });

  it('returns early without drawing when region width is zero', () => {
    const { state, gl } = makeGlState();
    defaultGlSpriteRenderer.submit(state, makeSpriteNode({ atlas: makeAtlas(0, 32), id: 0 }));
    flushGlSpriteBatch(state);
    expect(gl.drawElementsInstanced).not.toHaveBeenCalled();
  });

  it('draws a quad when the atlas region is valid', () => {
    const { state, gl } = makeGlState();
    registerDefaultGlMaterial(state);
    defaultGlSpriteRenderer.submit(state, makeSpriteNode({ atlas: makeAtlas(), id: 0 }));
    flushGlSpriteBatch(state);
    expect(gl.drawElementsInstanced).toHaveBeenCalledWith(expect.anything(), 6, expect.anything(), 0, 1);
  });
});
