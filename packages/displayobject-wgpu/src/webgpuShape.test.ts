import { renderWgpuBackground, submitWgpuRenderPass } from '@flighthq/render-wgpu';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu';
import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu';
import type { RenderProxy2D } from '@flighthq/types';
import { BatchFormat } from '@flighthq/types';

import { registerDefaultWgpuMaterial } from './webgpuDefaultMaterial';
import { defaultWgpuShapeRenderer, drawWgpuShape } from './webgpuShape';

vi.mock('@flighthq/node', () => ({
  getNodeLocalBoundsRectangle: () => ({ x: 0, y: 0, width: 64, height: 48 }),
  getNodeLocalContentRevision: (source: any) => source?.data?.version ?? 0,
}));

beforeAll(() => {
  installWgpuMock();
});

function makeShapeData() {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d')!;
  return { canvas, ctx, lastContentId: -1, lastW: 0, lastH: 0 };
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

describe('defaultWgpuShapeRenderer', () => {
  it('declares BatchFormat.Quad', () => {
    expect(defaultWgpuShapeRenderer.format).toBe(BatchFormat.Quad);
  });

  it('has createData and submit functions', () => {
    expect(typeof defaultWgpuShapeRenderer.createData).toBe('function');
    expect(typeof defaultWgpuShapeRenderer.submit).toBe('function');
  });
});

describe('drawWgpuShape', () => {
  it('returns early without writing to batch when commands are empty', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    registerDefaultWgpuMaterial(state);
    drawWgpuShape(state, makeShapeProxy({ commands: [] }, makeShapeData()));
    expect(getWgpuRenderStateRuntime(state).spriteBatchCount).toBe(0);
    submitWgpuRenderPass(state);
  });

  it('returns early without writing to batch when rendererData is null', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    registerDefaultWgpuMaterial(state);
    drawWgpuShape(state, makeShapeProxy({ commands: [{}] }, null));
    expect(getWgpuRenderStateRuntime(state).spriteBatchCount).toBe(0);
    submitWgpuRenderPass(state);
  });

  it('does not throw when renderPass is null', async () => {
    const state = await createWgpuRenderStateForTest();
    expect(() => drawWgpuShape(state, makeShapeProxy({ commands: [{}] }, makeShapeData()))).not.toThrow();
  });

  it('writes one instance to the sprite batch when shape has valid commands and bounds', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    registerDefaultWgpuMaterial(state);
    drawWgpuShape(state, makeShapeProxy({ commands: [{}], version: 1 }, makeShapeData()));
    expect(getWgpuRenderStateRuntime(state).spriteBatchCount).toBe(1);
    submitWgpuRenderPass(state);
  });
});
