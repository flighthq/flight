import type { RenderProxy2D } from '@flighthq/types/contract';

import { defaultGlQuadBatchRenderer } from './glQuadBatch';
import { flushGlQuadBatchWriter } from './glQuadBatchWriter';
import { registerGlStandardMaterial } from './glStandardMaterial';
import { createGlState } from './glTestHelper';

function makeAtlas() {
  const img = document.createElement('img');
  const image = createImageResource(img);
  image.width = 64;
  image.height = 64;
  return {
    regions: [{ x: 0, y: 0, width: 32, height: 32 }],
    texture: createTexture({ dimension: '2d', source: image }),
  };
}

function createAtlasGlState() {
  const result = createGlState();
  registerGlImageTextureResolver(result.state);
  return result;
}

function makeQuadBatchNode(data: Record<string, unknown> = {}): RenderProxy2D {
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
    material: null,
    materialData: null,
    renderer: null,
    traverseChildren: false,
    transform2D: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
  } as unknown as RenderProxy2D;
}

describe('defaultGlQuadBatchRenderer', () => {
  it('has a createData function', () => {
    expect(typeof defaultGlQuadBatchRenderer.createData).toBe('function');
  });

  it('has a submit function', () => {
    expect(typeof defaultGlQuadBatchRenderer.submit).toBe('function');
  });
});

describe('defaultGlQuadBatchRenderer.submit', () => {
  it('returns early without drawing when atlas is null', () => {
    const { state, gl } = createAtlasGlState();
    registerGlStandardMaterial(state);
    defaultGlQuadBatchRenderer.submit(state, makeQuadBatchNode({ atlas: null }));
    flushGlQuadBatchWriter(state as any);
    expect(gl.drawElementsInstanced).not.toHaveBeenCalled();
  });

  it('returns early without drawing when atlas.texture is null', () => {
    const { state, gl } = createAtlasGlState();
    registerGlStandardMaterial(state);
    defaultGlQuadBatchRenderer.submit(state, makeQuadBatchNode({ atlas: { regions: [], texture: null } }));
    flushGlQuadBatchWriter(state as any);
    expect(gl.drawElementsInstanced).not.toHaveBeenCalled();
  });

  it('returns early without drawing when atlas Texture is unbound', () => {
    const { state, gl } = createAtlasGlState();
    registerGlStandardMaterial(state);
    defaultGlQuadBatchRenderer.submit(state, makeQuadBatchNode({ atlas: { regions: [], texture: createTexture() } }));
    flushGlQuadBatchWriter(state as any);
    expect(gl.drawElementsInstanced).not.toHaveBeenCalled();
  });

  it('returns early without drawing when instanceCount is 0', () => {
    const { state, gl } = createAtlasGlState();
    registerGlStandardMaterial(state);
    defaultGlQuadBatchRenderer.submit(state, makeQuadBatchNode({ instanceCount: 0 }));
    flushGlQuadBatchWriter(state as any);
    expect(gl.drawElementsInstanced).not.toHaveBeenCalled();
  });

  it('draws all valid instances in a single instanced call with vector2 transform type', () => {
    const { state, gl } = createAtlasGlState();
    registerGlStandardMaterial(state);
    defaultGlQuadBatchRenderer.submit(
      state,
      makeQuadBatchNode({
        instanceCount: 2,
        ids: new Int32Array([0, 0]),
        transforms: new Float32Array([0, 0, 10, 20]),
        transformType: 'vector2',
      }),
    );
    flushGlQuadBatchWriter(state as any);
    expect(gl.drawElementsInstanced).toHaveBeenCalledTimes(1);
    expect(gl.drawElementsInstanced).toHaveBeenCalledWith(expect.anything(), 6, expect.anything(), 0, 2);
  });

  it('excludes out-of-range ids from the instanced draw count', () => {
    const { state, gl } = createAtlasGlState();
    registerGlStandardMaterial(state);
    defaultGlQuadBatchRenderer.submit(
      state,
      makeQuadBatchNode({
        instanceCount: 3,
        ids: new Int32Array([0, 99, 0]),
        transforms: new Float32Array([0, 0, 0, 0, 0, 0]),
        transformType: 'vector2',
      }),
    );
    flushGlQuadBatchWriter(state as any);
    expect(gl.drawElementsInstanced).toHaveBeenCalledTimes(1);
    expect(gl.drawElementsInstanced).toHaveBeenCalledWith(expect.anything(), 6, expect.anything(), 0, 2);
  });

  it('draws all valid instances in a single instanced call with full matrix transform type', () => {
    const { state, gl } = createAtlasGlState();
    registerGlStandardMaterial(state);
    const transforms = new Float32Array([1, 0, 0, 1, 0, 0]);
    defaultGlQuadBatchRenderer.submit(
      state,
      makeQuadBatchNode({
        instanceCount: 1,
        ids: new Int32Array([0]),
        transforms,
        transformType: 'matrix',
      }),
    );
    flushGlQuadBatchWriter(state as any);
    expect(gl.drawElementsInstanced).toHaveBeenCalledTimes(1);
    expect(gl.drawElementsInstanced).toHaveBeenCalledWith(expect.anything(), 6, expect.anything(), 0, 1);
  });
});
import { createImageResource } from '@flighthq/image/contract';
import { registerGlImageTextureResolver } from '@flighthq/render-gl/contract';
import { createTexture } from '@flighthq/texture/contract';
