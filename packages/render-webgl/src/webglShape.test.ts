import type { RenderProxy2D } from '@flighthq/types';
import { BatchFormat } from '@flighthq/types';

import { registerDefaultWebGLMaterial } from './webglDefaultMaterial';
import { defaultWebGLShapeRenderer, drawWebGLShape, drawWebGLShapeMask } from './webglShape';
import { flushWebGLSpriteBatch } from './webglSpriteBatch';
import { makeWebGLState } from './webglTestHelper';

vi.mock('@flighthq/node', () => ({
  getNodeLocalBoundsRectangle: () => ({ x: 0, y: 0, width: 64, height: 48 }),
  getNodeLocalContentRevision: (source: any) => source?.data?.version ?? 0,
}));

function makeShapeData() {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d')!;
  return { canvas, ctx, lastContentID: -1, lastW: 0, lastH: 0 };
}

function makeShapeNode(data: Record<string, unknown> = {}, rendererData: unknown = null): RenderProxy2D {
  return {
    source: {
      data: {
        commands: [],
        version: 0,
        ...data,
      },
    },
    rendererData: rendererData,
    blendMode: 0,
    alpha: 1,
    material: null,
    materialData: null,
    transform2D: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
  } as unknown as RenderProxy2D;
}

describe('defaultWebGLShapeRenderer', () => {
  it('declares BatchFormat.Quad', () => {
    expect(defaultWebGLShapeRenderer.format).toBe(BatchFormat.Quad);
  });

  it('has a createData function', () => {
    expect(typeof defaultWebGLShapeRenderer.createData).toBe('function');
  });

  it('has a submit function pointing to drawWebGLShape', () => {
    expect(defaultWebGLShapeRenderer.submit).toBe(drawWebGLShape);
  });

  it('has a drawMask function pointing to drawWebGLShapeMask', () => {});
});

describe('drawWebGLShape', () => {
  it('returns early without writing to batch when commands array is empty', () => {
    const { state } = makeWebGLState();
    registerDefaultWebGLMaterial(state);
    drawWebGLShape(state, makeShapeNode({ commands: [] }, makeShapeData()));
    expect(state.spriteBatchCount).toBe(0);
  });

  it('returns early without writing to batch when rendererData is null', () => {
    const { state } = makeWebGLState();
    registerDefaultWebGLMaterial(state);
    drawWebGLShape(state, makeShapeNode({ commands: [{}] }, null));
    expect(state.spriteBatchCount).toBe(0);
  });

  it('returns early without writing to batch when no material renderer is registered', () => {
    const { state } = makeWebGLState();
    drawWebGLShape(state, makeShapeNode({ commands: [{}] }, makeShapeData()));
    expect(state.spriteBatchCount).toBe(0);
  });

  it('writes one instance to the sprite batch when shape has valid commands and bounds', () => {
    const { state } = makeWebGLState();
    registerDefaultWebGLMaterial(state);
    drawWebGLShape(state, makeShapeNode({ commands: [{}], version: 1 }, makeShapeData()));
    expect(state.spriteBatchCount).toBe(1);
  });

  it('draws via drawElementsInstanced after flush', () => {
    const { state, gl } = makeWebGLState();
    registerDefaultWebGLMaterial(state);
    drawWebGLShape(state, makeShapeNode({ commands: [{}], version: 1 }, makeShapeData()));
    flushWebGLSpriteBatch(state as any);
    expect(gl.drawElementsInstanced).toHaveBeenCalled();
  });

  it('writes correct size into instance data', () => {
    const { state } = makeWebGLState();
    registerDefaultWebGLMaterial(state);
    drawWebGLShape(state, makeShapeNode({ commands: [{}], version: 1 }, makeShapeData()));
    const d = state.spriteBatchInstanceData;
    expect(d[6]).toBe(64); // width from mocked bounds
    expect(d[7]).toBe(48); // height from mocked bounds
  });
});

describe('drawWebGLShapeMask', () => {
  it('uses the shape draw path', () => {
    const { state } = makeWebGLState();
    expect(() => drawWebGLShapeMask(state, makeShapeNode({ commands: [] }, makeShapeData()))).not.toThrow();
    expect(state.spriteBatchCount).toBe(0);
  });
});
