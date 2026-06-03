import type { SpriteRenderNode } from '@flighthq/types';

import { defaultWebGLQuadBatchRenderer, drawWebGLQuadBatch } from './webglQuadBatch';
import { makeWebGLState } from './webglTestHelper';

function makeAtlas() {
  const img = document.createElement('img');
  return {
    image: { src: img, width: 64, height: 64 },
    regions: [{ x: 0, y: 0, width: 32, height: 32 }],
  };
}

function makeQuadBatchNode(data: Record<string, unknown> = {}): SpriteRenderNode {
  return {
    source: {
      data: {
        atlas: makeAtlas(),
        instanceCount: 1,
        ids: new Int32Array([0]),
        transforms: new Float32Array([0, 0]),
        transformType: 'vector2',
        ...data,
      },
    },
    blendMode: 0,
    alpha: 1,
    transform2D: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
  } as unknown as SpriteRenderNode;
}

describe('defaultWebGLQuadBatchRenderer', () => {
  it('has a createData function', () => {
    expect(typeof defaultWebGLQuadBatchRenderer.createData).toBe('function');
  });

  it('has a draw function pointing to drawWebGLQuadBatch', () => {
    expect(defaultWebGLQuadBatchRenderer.draw).toBe(drawWebGLQuadBatch);
  });
});

describe('drawWebGLQuadBatch', () => {
  it('returns early without drawing when atlas is null', () => {
    const { state, gl } = makeWebGLState();
    drawWebGLQuadBatch(state, makeQuadBatchNode({ atlas: null }));
    expect(gl.drawElements).not.toHaveBeenCalled();
  });

  it('returns early without drawing when atlas.image is null', () => {
    const { state, gl } = makeWebGLState();
    drawWebGLQuadBatch(state, makeQuadBatchNode({ atlas: { image: null, regions: [] } }));
    expect(gl.drawElements).not.toHaveBeenCalled();
  });

  it('returns early without drawing when atlas.image.src is null', () => {
    const { state, gl } = makeWebGLState();
    drawWebGLQuadBatch(state, makeQuadBatchNode({ atlas: { image: { src: null }, regions: [] } }));
    expect(gl.drawElements).not.toHaveBeenCalled();
  });

  it('returns early without drawing when instanceCount is 0', () => {
    const { state, gl } = makeWebGLState();
    drawWebGLQuadBatch(state, makeQuadBatchNode({ instanceCount: 0 }));
    expect(gl.drawElements).not.toHaveBeenCalled();
  });

  it('draws one quad per valid instance with vector2 transform type', () => {
    const { state, gl } = makeWebGLState();
    drawWebGLQuadBatch(
      state,
      makeQuadBatchNode({
        instanceCount: 2,
        ids: new Int32Array([0, 0]),
        transforms: new Float32Array([0, 0, 10, 20]),
        transformType: 'vector2',
      }),
    );
    expect(gl.drawElements).toHaveBeenCalledTimes(2);
  });

  it('skips instances with out-of-range ids', () => {
    const { state, gl } = makeWebGLState();
    drawWebGLQuadBatch(
      state,
      makeQuadBatchNode({
        instanceCount: 3,
        ids: new Int32Array([0, 99, 0]),
        transforms: new Float32Array([0, 0, 0, 0, 0, 0]),
        transformType: 'vector2',
      }),
    );
    expect(gl.drawElements).toHaveBeenCalledTimes(2);
  });

  it('draws one quad per valid instance with full matrix transform type', () => {
    const { state, gl } = makeWebGLState();
    const transforms = new Float32Array([1, 0, 0, 1, 0, 0]);
    drawWebGLQuadBatch(
      state,
      makeQuadBatchNode({
        instanceCount: 1,
        ids: new Int32Array([0]),
        transforms,
        transformType: 'matrix',
      }),
    );
    expect(gl.drawElements).toHaveBeenCalledTimes(1);
  });
});
