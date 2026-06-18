import type { RenderProxy2D } from '@flighthq/types';
import { BatchFormat } from '@flighthq/types';

import { renderWebGPUBackground, submitWebGPURenderPass } from './webgpuBackground';
import { registerDefaultWebGPUMaterial } from './webgpuDefaultMaterial';
import { defaultWebGPUShapeRenderer, drawWebGPUShape, drawWebGPUShapeMask } from './webgpuShape';
import { createWebGPURenderStateForTest, installWebGPUMock } from './webgpuTestHelper';

vi.mock('@flighthq/node', () => ({
  getNodeLocalBoundsRectangle: () => ({ x: 0, y: 0, width: 64, height: 48 }),
  getNodeLocalContentRevision: (source: any) => source?.data?.version ?? 0,
}));

beforeAll(() => {
  installWebGPUMock();
});

function makeShapeData() {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d')!;
  return { canvas, ctx, lastContentID: -1, lastW: 0, lastH: 0 };
}

function makeShapeProxy(data: Record<string, unknown> = {}, rendererData: unknown = null): RenderProxy2D {
  return {
    source: { data: { commands: [], version: 0, ...data } },
    blendMode: 0,
    alpha: 1,
    material: null,
    materialData: null,
    transform2D: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
    rendererData,
  } as unknown as RenderProxy2D;
}

describe('defaultWebGPUShapeRenderer', () => {
  it('declares BatchFormat.Quad', () => {
    expect(defaultWebGPUShapeRenderer.format).toBe(BatchFormat.Quad);
  });

  it('has createData and submit functions', () => {
    expect(typeof defaultWebGPUShapeRenderer.createData).toBe('function');
    expect(typeof defaultWebGPUShapeRenderer.submit).toBe('function');
  });
});

describe('drawWebGPUShape', () => {
  it('returns early without writing to batch when commands are empty', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    registerDefaultWebGPUMaterial(state);
    drawWebGPUShape(state, makeShapeProxy({ commands: [] }, makeShapeData()));
    expect((state as any).spriteBatchCount).toBe(0);
    submitWebGPURenderPass(state);
  });

  it('returns early without writing to batch when rendererData is null', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    registerDefaultWebGPUMaterial(state);
    drawWebGPUShape(state, makeShapeProxy({ commands: [{}] }, null));
    expect((state as any).spriteBatchCount).toBe(0);
    submitWebGPURenderPass(state);
  });

  it('does not throw when renderPass is null', async () => {
    const state = await createWebGPURenderStateForTest();
    expect(() => drawWebGPUShape(state, makeShapeProxy({ commands: [{}] }, makeShapeData()))).not.toThrow();
  });

  it('writes one instance to the sprite batch when shape has valid commands and bounds', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    registerDefaultWebGPUMaterial(state);
    drawWebGPUShape(state, makeShapeProxy({ commands: [{}], version: 1 }, makeShapeData()));
    expect((state as any).spriteBatchCount).toBe(1);
    submitWebGPURenderPass(state);
  });
});

describe('drawWebGPUShapeMask', () => {
  it('delegates to drawWebGPUShape', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    expect(() => drawWebGPUShapeMask(state, makeShapeProxy({ commands: [] }, makeShapeData()))).not.toThrow();
    submitWebGPURenderPass(state);
  });
});
