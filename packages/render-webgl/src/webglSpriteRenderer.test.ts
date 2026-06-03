import type { SpriteRenderNode } from '@flighthq/types';

import { defaultWebGLSpriteRenderer, drawWebGLSpriteNode } from './webglSpriteRenderer';
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
    transform2D: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
  } as unknown as SpriteRenderNode;
}

describe('defaultWebGLSpriteRenderer', () => {
  it('has a createData function', () => {
    expect(typeof defaultWebGLSpriteRenderer.createData).toBe('function');
  });

  it('has a draw function pointing to drawWebGLSpriteNode', () => {
    expect(defaultWebGLSpriteRenderer.draw).toBe(drawWebGLSpriteNode);
  });
});

describe('drawWebGLSpriteNode', () => {
  it('returns early without drawing when atlas is null', () => {
    const { state, gl } = makeWebGLState();
    drawWebGLSpriteNode(state, makeSpriteNode({ atlas: null }));
    expect(gl.drawElements).not.toHaveBeenCalled();
  });

  it('returns early without drawing when atlas.image is null', () => {
    const { state, gl } = makeWebGLState();
    drawWebGLSpriteNode(state, makeSpriteNode({ atlas: { image: null, regions: [] } }));
    expect(gl.drawElements).not.toHaveBeenCalled();
  });

  it('returns early without drawing when atlas.image.src is null', () => {
    const { state, gl } = makeWebGLState();
    drawWebGLSpriteNode(state, makeSpriteNode({ atlas: { image: { src: null }, regions: [] } }));
    expect(gl.drawElements).not.toHaveBeenCalled();
  });

  it('returns early without drawing when id is negative', () => {
    const { state, gl } = makeWebGLState();
    drawWebGLSpriteNode(state, makeSpriteNode({ atlas: makeAtlas(), id: -1 }));
    expect(gl.drawElements).not.toHaveBeenCalled();
  });

  it('returns early without drawing when id exceeds region count', () => {
    const { state, gl } = makeWebGLState();
    drawWebGLSpriteNode(state, makeSpriteNode({ atlas: makeAtlas(), id: 99 }));
    expect(gl.drawElements).not.toHaveBeenCalled();
  });

  it('returns early without drawing when region width is zero', () => {
    const { state, gl } = makeWebGLState();
    drawWebGLSpriteNode(state, makeSpriteNode({ atlas: makeAtlas(0, 32), id: 0 }));
    expect(gl.drawElements).not.toHaveBeenCalled();
  });

  it('returns early without drawing when region height is zero', () => {
    const { state, gl } = makeWebGLState();
    drawWebGLSpriteNode(state, makeSpriteNode({ atlas: makeAtlas(32, 0), id: 0 }));
    expect(gl.drawElements).not.toHaveBeenCalled();
  });

  it('draws a quad when the atlas region is valid', () => {
    const { state, gl } = makeWebGLState();
    drawWebGLSpriteNode(state, makeSpriteNode({ atlas: makeAtlas(), id: 0 }));
    expect(gl.drawElements).toHaveBeenCalled();
  });
});
