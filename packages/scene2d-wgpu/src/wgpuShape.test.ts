import { createImageResource } from '@flighthq/image';
import type * as FlightNodeModule from '@flighthq/node';
import { renderWgpuBackground, submitWgpuRenderPass } from '@flighthq/render-wgpu';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu';
import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu';
import type { RenderProxy2D } from '@flighthq/types';
import { BatchFormat } from '@flighthq/types';

import { scopeModuleMocks } from './moduleMockTestHelper';
import { registerDefaultWgpuMaterial } from './wgpuDefaultMaterial';
import type * as WgpuShapeModule from './wgpuShape';

// @flighthq/node's bounds/revision queries expect a real BoundsNode; these tests drive drawWgpuShape
// with lightweight fake proxies, so the two queries are stubbed. scopeModuleMocks scopes the stub to
// this file (registry reset before the mock applies, unmock + reset after), so under a shared
// (isolate:false) worker it never leaks into the many real consumers of these functions (node,
// interaction, shape, text) — and a sibling that pre-evaluated ./wgpuShape still picks up the stub.
let defaultWgpuShapeRenderer: typeof WgpuShapeModule.defaultWgpuShapeRenderer;
let drawWgpuShape: typeof WgpuShapeModule.drawWgpuShape;

scopeModuleMocks(['@flighthq/node']);

beforeAll(async () => {
  vi.doMock('@flighthq/node', async (importOriginal) => ({
    ...(await importOriginal<typeof FlightNodeModule>()),
    getNodeLocalBoundsRectangle: () => ({ x: 0, y: 0, width: 64, height: 48 }),
    getNodeLocalContentRevision: (source: any) => source?.data?.version ?? 0,
  }));
  ({ defaultWgpuShapeRenderer, drawWgpuShape } = await import('./wgpuShape'));
  installWgpuMock();
});

function makeShapeData() {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d')!;
  return { canvas, ctx, image: createImageResource(canvas), lastContentId: -1, lastW: 0, lastH: 0 };
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
