import { createImageResource } from '@flighthq/image';
import type * as FlightNodeModule from '@flighthq/node';
import { getGlRenderStateRuntime } from '@flighthq/render-gl';
import type { RenderProxy2D } from '@flighthq/types';
import { BatchFormat } from '@flighthq/types';

import { registerDefaultGlMaterial } from './glDefaultMaterial';
import type * as GlShapeModule from './glShape';
import { flushGlSpriteBatch } from './glSpriteBatch';
import { createGlState } from './glTestHelper';
import { scopeModuleMocks } from './moduleMockTestHelper';

// @flighthq/node's bounds/revision queries expect a real BoundsNode; these tests drive drawGlShape
// with lightweight fake proxies, so the two queries are stubbed. scopeModuleMocks scopes the stub to
// this file (registry reset before the mock applies, unmock + reset after), so under a shared
// (isolate:false) worker it never leaks into the many real consumers of these functions (node,
// interaction, shape, text) — and a sibling that pre-evaluated ./glShape still picks up the stub.
let defaultGlShapeRenderer: typeof GlShapeModule.defaultGlShapeRenderer;
let drawGlShape: typeof GlShapeModule.drawGlShape;

scopeModuleMocks(['@flighthq/node']);

beforeAll(async () => {
  vi.doMock('@flighthq/node', async (importOriginal) => ({
    ...(await importOriginal<typeof FlightNodeModule>()),
    getNodeLocalBoundsRectangle: () => ({ x: 0, y: 0, width: 64, height: 48 }),
    getNodeLocalContentRevision: (source: any) => source?.data?.version ?? 0,
  }));
  ({ defaultGlShapeRenderer, drawGlShape } = await import('./glShape'));
});

function makeShapeData() {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d')!;
  return { canvas, ctx, image: createImageResource(canvas), lastContentId: -1, lastW: 0, lastH: 0 };
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
    const { state } = createGlState();
    registerDefaultGlMaterial(state);
    drawGlShape(state, makeShapeNode({ commands: [] }, makeShapeData()));
    expect(getGlRenderStateRuntime(state).spriteBatchCount).toBe(0);
  });

  it('returns early without writing to batch when rendererData is null', () => {
    const { state } = createGlState();
    registerDefaultGlMaterial(state);
    drawGlShape(state, makeShapeNode({ commands: [{}] }, null));
    expect(getGlRenderStateRuntime(state).spriteBatchCount).toBe(0);
  });

  it('returns early without writing to batch when no material renderer is registered', () => {
    const { state } = createGlState();
    drawGlShape(state, makeShapeNode({ commands: [{}] }, makeShapeData()));
    expect(getGlRenderStateRuntime(state).spriteBatchCount).toBe(0);
  });

  it('writes one instance to the sprite batch when shape has valid commands and bounds', () => {
    const { state } = createGlState();
    registerDefaultGlMaterial(state);
    drawGlShape(state, makeShapeNode({ commands: [{}], version: 1 }, makeShapeData()));
    expect(getGlRenderStateRuntime(state).spriteBatchCount).toBe(1);
  });

  it('draws via drawElementsInstanced after flush', () => {
    const { state, gl } = createGlState();
    registerDefaultGlMaterial(state);
    drawGlShape(state, makeShapeNode({ commands: [{}], version: 1 }, makeShapeData()));
    flushGlSpriteBatch(state);
    expect(gl.drawElementsInstanced).toHaveBeenCalled();
  });

  it('writes correct size into instance data', () => {
    const { state } = createGlState();
    registerDefaultGlMaterial(state);
    drawGlShape(state, makeShapeNode({ commands: [{}], version: 1 }, makeShapeData()));
    const d = getGlRenderStateRuntime(state).spriteBatchInstanceData;
    expect(d[6]).toBe(64); // width from mocked bounds
    expect(d[7]).toBe(48); // height from mocked bounds
  });
});
