import { getGlRenderStateRuntime } from '@flighthq/render-gl';
import type { RenderProxy2D } from '@flighthq/types';
import { BatchFormat } from '@flighthq/types';

import { registerDefaultGlMaterial } from './glDefaultMaterial';
import { defaultGlShapeRenderer, drawGlShape } from './glShape';
import { flushGlSpriteBatch } from './glSpriteBatch';
import { makeGlState } from './glTestHelper';

vi.mock('@flighthq/node', () => ({
  getNodeLocalBoundsRectangle: () => ({ x: 0, y: 0, width: 64, height: 48 }),
  getNodeLocalContentRevision: (source: any) => source?.data?.version ?? 0,
}));

function makeShapeData() {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d')!;
  return { canvas, ctx, lastContentId: -1, lastW: 0, lastH: 0 };
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

describe('defaultGlShapeRenderer', () => {
  it('declares BatchFormat.Quad', () => {
    expect(defaultGlShapeRenderer.format).toBe(BatchFormat.Quad);
  });

  it('has a createData function', () => {
    expect(typeof defaultGlShapeRenderer.createData).toBe('function');
  });

  it('has a submit function pointing to drawGlShape', () => {
    expect(defaultGlShapeRenderer.submit).toBe(drawGlShape);
  });
});

describe('drawGlShape', () => {
  it('returns early without writing to batch when commands array is empty', () => {
    const { state } = makeGlState();
    registerDefaultGlMaterial(state);
    drawGlShape(state, makeShapeNode({ commands: [] }, makeShapeData()));
    expect(getGlRenderStateRuntime(state).spriteBatchCount).toBe(0);
  });

  it('returns early without writing to batch when rendererData is null', () => {
    const { state } = makeGlState();
    registerDefaultGlMaterial(state);
    drawGlShape(state, makeShapeNode({ commands: [{}] }, null));
    expect(getGlRenderStateRuntime(state).spriteBatchCount).toBe(0);
  });

  it('returns early without writing to batch when no material renderer is registered', () => {
    const { state } = makeGlState();
    drawGlShape(state, makeShapeNode({ commands: [{}] }, makeShapeData()));
    expect(getGlRenderStateRuntime(state).spriteBatchCount).toBe(0);
  });

  it('writes one instance to the sprite batch when shape has valid commands and bounds', () => {
    const { state } = makeGlState();
    registerDefaultGlMaterial(state);
    drawGlShape(state, makeShapeNode({ commands: [{}], version: 1 }, makeShapeData()));
    expect(getGlRenderStateRuntime(state).spriteBatchCount).toBe(1);
  });

  it('draws via drawElementsInstanced after flush', () => {
    const { state, gl } = makeGlState();
    registerDefaultGlMaterial(state);
    drawGlShape(state, makeShapeNode({ commands: [{}], version: 1 }, makeShapeData()));
    flushGlSpriteBatch(state);
    expect(gl.drawElementsInstanced).toHaveBeenCalled();
  });

  it('writes correct size into instance data', () => {
    const { state } = makeGlState();
    registerDefaultGlMaterial(state);
    drawGlShape(state, makeShapeNode({ commands: [{}], version: 1 }, makeShapeData()));
    const d = getGlRenderStateRuntime(state).spriteBatchInstanceData;
    expect(d[6]).toBe(64); // width from mocked bounds
    expect(d[7]).toBe(48); // height from mocked bounds
  });
});
