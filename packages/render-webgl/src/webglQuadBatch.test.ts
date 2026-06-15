import type { SpriteRenderNode } from '@flighthq/types';

import { defaultWebGLQuadBatchRenderer } from './webglQuadBatch';
import { flushWebGLSpriteBatch } from './webglSpriteBatch';
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
    renderer: null,
    traverseChildren: false,
    transform2D: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
  } as unknown as SpriteRenderNode;
}

describe('defaultWebGLQuadBatchRenderer', () => {
  it('has a createData function', () => {
    expect(typeof defaultWebGLQuadBatchRenderer.createData).toBe('function');
  });

  it('has a submit function', () => {
    expect(typeof defaultWebGLQuadBatchRenderer.submit).toBe('function');
  });
});

describe('defaultWebGLQuadBatchRenderer.submit', () => {
  it('returns early without drawing when atlas is null', () => {
    const { state, gl } = makeWebGLState();
    defaultWebGLQuadBatchRenderer.submit(state, makeQuadBatchNode({ atlas: null }));
    flushWebGLSpriteBatch(state as any);
    expect(gl.drawElementsInstanced).not.toHaveBeenCalled();
  });

  it('returns early without drawing when atlas.image is null', () => {
    const { state, gl } = makeWebGLState();
    defaultWebGLQuadBatchRenderer.submit(state, makeQuadBatchNode({ atlas: { image: null, regions: [] } }));
    flushWebGLSpriteBatch(state as any);
    expect(gl.drawElementsInstanced).not.toHaveBeenCalled();
  });

  it('returns early without drawing when atlas.image.src is null', () => {
    const { state, gl } = makeWebGLState();
    defaultWebGLQuadBatchRenderer.submit(state, makeQuadBatchNode({ atlas: { image: { src: null }, regions: [] } }));
    flushWebGLSpriteBatch(state as any);
    expect(gl.drawElementsInstanced).not.toHaveBeenCalled();
  });

  it('returns early without drawing when instanceCount is 0', () => {
    const { state, gl } = makeWebGLState();
    defaultWebGLQuadBatchRenderer.submit(state, makeQuadBatchNode({ instanceCount: 0 }));
    flushWebGLSpriteBatch(state as any);
    expect(gl.drawElementsInstanced).not.toHaveBeenCalled();
  });

  it('draws all valid instances in a single instanced call with vector2 transform type', () => {
    const { state, gl } = makeWebGLState();
    defaultWebGLQuadBatchRenderer.submit(
      state,
      makeQuadBatchNode({
        instanceCount: 2,
        ids: new Int32Array([0, 0]),
        transforms: new Float32Array([0, 0, 10, 20]),
        transformType: 'vector2',
      }),
    );
    flushWebGLSpriteBatch(state as any);
    expect(gl.drawElementsInstanced).toHaveBeenCalledTimes(1);
    expect(gl.drawElementsInstanced).toHaveBeenCalledWith(expect.anything(), 6, expect.anything(), 0, 2);
  });

  it('excludes out-of-range ids from the instanced draw count', () => {
    const { state, gl } = makeWebGLState();
    defaultWebGLQuadBatchRenderer.submit(
      state,
      makeQuadBatchNode({
        instanceCount: 3,
        ids: new Int32Array([0, 99, 0]),
        transforms: new Float32Array([0, 0, 0, 0, 0, 0]),
        transformType: 'vector2',
      }),
    );
    flushWebGLSpriteBatch(state as any);
    expect(gl.drawElementsInstanced).toHaveBeenCalledTimes(1);
    expect(gl.drawElementsInstanced).toHaveBeenCalledWith(expect.anything(), 6, expect.anything(), 0, 2);
  });

  it('draws all valid instances in a single instanced call with full matrix transform type', () => {
    const { state, gl } = makeWebGLState();
    const transforms = new Float32Array([1, 0, 0, 1, 0, 0]);
    defaultWebGLQuadBatchRenderer.submit(
      state,
      makeQuadBatchNode({
        instanceCount: 1,
        ids: new Int32Array([0]),
        transforms,
        transformType: 'matrix',
      }),
    );
    flushWebGLSpriteBatch(state as any);
    expect(gl.drawElementsInstanced).toHaveBeenCalledTimes(1);
    expect(gl.drawElementsInstanced).toHaveBeenCalledWith(expect.anything(), 6, expect.anything(), 0, 1);
  });
});
