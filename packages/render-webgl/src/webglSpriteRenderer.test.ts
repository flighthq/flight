import type { SpriteRenderNode } from '@flighthq/types';

import { flushWebGLSpriteBatch } from './webglSpriteBatch';
import { defaultWebGLSpriteRenderer } from './webglSpriteRenderer';
import { makeWebGLState } from './webglTestHelper';

function makeAtlas(regionWidth = 32, regionHeight = 32) {
  const img = document.createElement('img');
  return {
    image: { src: img, width: 64, height: 64 },
    regions: [{ x: 0, y: 0, width: regionWidth, height: regionHeight }],
  };
}

function makeSpriteNode(data: Record<string, unknown> = {}): SpriteRenderNode {
  return {
    source: { data: { atlas: null, id: 0, ...data } },
    blendMode: 0,
    alpha: 1,
    renderer: null,
    traverseChildren: false,
    transform2D: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
  } as unknown as SpriteRenderNode;
}

describe('defaultWebGLSpriteRenderer', () => {
  it('has a createData function', () => {
    expect(typeof defaultWebGLSpriteRenderer.createData).toBe('function');
  });

  it('has a submit function', () => {
    expect(typeof defaultWebGLSpriteRenderer.submit).toBe('function');
  });
});

describe('defaultWebGLSpriteRenderer.submit', () => {
  it('returns early without drawing when atlas is null', () => {
    const { state, gl } = makeWebGLState();
    defaultWebGLSpriteRenderer.submit(state, makeSpriteNode({ atlas: null }));
    flushWebGLSpriteBatch(state as any);
    expect(gl.drawElementsInstanced).not.toHaveBeenCalled();
  });

  it('returns early without drawing when atlas.image is null', () => {
    const { state, gl } = makeWebGLState();
    defaultWebGLSpriteRenderer.submit(state, makeSpriteNode({ atlas: { image: null, regions: [] } }));
    flushWebGLSpriteBatch(state as any);
    expect(gl.drawElementsInstanced).not.toHaveBeenCalled();
  });

  it('returns early without drawing when id is negative', () => {
    const { state, gl } = makeWebGLState();
    defaultWebGLSpriteRenderer.submit(state, makeSpriteNode({ atlas: makeAtlas(), id: -1 }));
    flushWebGLSpriteBatch(state as any);
    expect(gl.drawElementsInstanced).not.toHaveBeenCalled();
  });

  it('returns early without drawing when region width is zero', () => {
    const { state, gl } = makeWebGLState();
    defaultWebGLSpriteRenderer.submit(state, makeSpriteNode({ atlas: makeAtlas(0, 32), id: 0 }));
    flushWebGLSpriteBatch(state as any);
    expect(gl.drawElementsInstanced).not.toHaveBeenCalled();
  });

  it('draws a quad when the atlas region is valid', () => {
    const { state, gl } = makeWebGLState();
    defaultWebGLSpriteRenderer.submit(state, makeSpriteNode({ atlas: makeAtlas(), id: 0 }));
    flushWebGLSpriteBatch(state as any);
    expect(gl.drawElementsInstanced).toHaveBeenCalledWith(expect.anything(), 6, expect.anything(), 0, 1);
  });
});
