import { createImageResource } from '@flighthq/image/contract';
import type * as FlightNodeModule from '@flighthq/node/contract';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu/contract';
import { createWgpuRenderStateForTest, installWgpuMock, renderWgpuBackground } from '@flighthq/render-wgpu/contract';
import {
  enableRenderRegistryGuards,
  explainRenderRegistryMisses,
  resetRaster2DSurfaceProviderForTest,
  setRaster2DSurfaceProvider,
} from '@flighthq/render/contract';
import { appendShapeBeginFill, appendShapeEndFill, appendShapeRectangle, createShape } from '@flighthq/shape/contract';
import type { RenderProxy2D } from '@flighthq/types/contract';
import { BatchFormat, RenderRegistry } from '@flighthq/types/contract';

// ★ A HOISTED MOCK, NOT A HAND-ROLLED ONE. This file is in REGISTRY_ISOLATED_TESTS, so it already runs
// with its own module registry — the hermeticity the `scopeModuleMocks` + `vi.doMock` + dynamic-import
// dance bought by hand comes from the platform here, with no hook. The dance was not merely redundant:
// it rebuilt the subject's entire transitive module graph inside a FIXED `beforeAll` deadline, which is
// unbounded work against a fixed clock and the shape of flake that tiering exists to remove.
vi.mock('@flighthq/node/contract', async (importOriginal) => ({
  ...(await importOriginal<typeof FlightNodeModule>()),
  getNodeLocalBoundsRectangle: () => ({ x: 0, y: 0, width: 64, height: 48 }),
  getNodeLocalContentRevision: (source: { data?: { version?: number } } | null | undefined) =>
    source?.data?.version ?? 0,
}));

import { defaultWgpuRasterShapeRenderer, drawWgpuRasterShape } from './wgpuRasterShapeRenderer';
import { registerWgpuShapeRasterizer } from './wgpuShapeRasterizer';
import { registerWgpuStandardMaterial } from './wgpuStandardMaterial';

beforeAll(() => installWgpuMock());

beforeEach(() => {
  setRaster2DSurfaceProvider({
    createRaster2DSurface(width, height) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d')!;
      return {
        get width() {
          return canvas.width;
        },
        set width(value) {
          canvas.width = value;
        },
        get height() {
          return canvas.height;
        },
        set height(value) {
          canvas.height = value;
        },
        context,
        image: createImageResource(canvas),
      };
    },
    destroyRaster2DSurface() {},
  });
});

afterEach(() => {
  resetRaster2DSurfaceProviderForTest();
});

function makeShapeData() {
  return {
    surface: null,
    lastContentId: -1,
    lastPixelRatio: 0,
    lastW: 0,
    lastH: 0,
    meshVersion: -1,
    meshes: null,
    meshBuffers: {
      vertexBuffers: [],
      vertexCapacities: [],
      indexBuffers: [],
      indexCapacities: [],
      uniformBuffers: [],
      bindGroups: [],
      colorScaleBiasUniformBuffers: [],
      colorScaleBiasBindGroups: [],
    },
  };
}

function makeShapeProxy(data: Record<string, unknown>, rendererData: unknown = makeShapeData()): RenderProxy2D {
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

function makeMeshPassSpy(): GPURenderPassEncoder {
  return {
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    setVertexBuffer: vi.fn(),
    setIndexBuffer: vi.fn(),
    setStencilReference: vi.fn(),
    draw: vi.fn(),
    drawIndexed: vi.fn(),
    end: vi.fn(),
  } as unknown as GPURenderPassEncoder;
}

// A plain solid rectangle — precisely the shape the mesh strategy would tessellate.
function solidShape() {
  const shape = createShape();
  appendShapeBeginFill(shape, 0x00cc00ff);
  appendShapeRectangle(shape, 8, 8, 32, 24);
  appendShapeEndFill(shape);
  return shape;
}

describe('defaultWgpuRasterShapeRenderer', () => {
  it('declares BatchFormat.Quad and the shared shape data lifecycle', () => {
    expect(defaultWgpuRasterShapeRenderer.format).toBe(BatchFormat.Quad);
    expect(typeof defaultWgpuRasterShapeRenderer.createData).toBe('function');
    expect(typeof defaultWgpuRasterShapeRenderer.destroyData).toBe('function');
    expect(defaultWgpuRasterShapeRenderer.submit).toBe(drawWgpuRasterShape);
  });
});

describe('drawWgpuRasterShape', () => {
  it('rasterizes a fill the mesh path could have tessellated, which is what pinning this strategy means', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    registerWgpuStandardMaterial(state);
    const pass = makeMeshPassSpy();
    getWgpuRenderStateRuntime(state).renderPass = pass;
    const rasterizer = vi.fn();
    registerWgpuShapeRasterizer(state, rasterizer);

    drawWgpuRasterShape(state, makeShapeProxy({ commands: solidShape().data.commands, version: 1 }));

    expect(rasterizer).toHaveBeenCalledTimes(1);
    expect(pass.drawIndexed).not.toHaveBeenCalled();
    expect(getWgpuRenderStateRuntime(state).quadBatchWriterCount).toBe(1);
  });

  it('replays the whole command stream, not the subset a mesh path could not express', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    registerWgpuStandardMaterial(state);
    getWgpuRenderStateRuntime(state).renderPass = makeMeshPassSpy();
    const shape = solidShape();
    let replayed: readonly unknown[] = [];
    registerWgpuShapeRasterizer(state, (_ctx, commands) => {
      replayed = commands;
    });

    drawWgpuRasterShape(state, makeShapeProxy({ commands: shape.data.commands, version: 1 }));

    expect(replayed).toEqual(shape.data.commands);
  });

  it('reports a ShapeRasterizer miss when no rasterizer is registered', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    getWgpuRenderStateRuntime(state).renderPass = makeMeshPassSpy();
    enableRenderRegistryGuards(state);

    drawWgpuRasterShape(state, makeShapeProxy({ commands: solidShape().data.commands, version: 1 }));

    expect(explainRenderRegistryMisses(state).misses).toContainEqual({
      kind: 'Shape',
      registry: RenderRegistry.ShapeRasterizer,
    });
  });

  it('preserves expected surface absence without rasterizing or writing a batch', async () => {
    resetRaster2DSurfaceProviderForTest();
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    registerWgpuStandardMaterial(state);
    getWgpuRenderStateRuntime(state).renderPass = makeMeshPassSpy();
    const rasterizer = vi.fn();
    registerWgpuShapeRasterizer(state, rasterizer);

    drawWgpuRasterShape(state, makeShapeProxy({ commands: solidShape().data.commands, version: 1 }));

    expect(rasterizer).not.toHaveBeenCalled();
    expect(getWgpuRenderStateRuntime(state).quadBatchWriterCount).toBe(0);
  });

  it('does nothing without a render pass, for an empty command list, or with absent renderer data', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    registerWgpuStandardMaterial(state);
    const rasterizer = vi.fn();
    registerWgpuShapeRasterizer(state, rasterizer);

    getWgpuRenderStateRuntime(state).renderPass = null;
    drawWgpuRasterShape(state, makeShapeProxy({ commands: solidShape().data.commands, version: 1 }));
    getWgpuRenderStateRuntime(state).renderPass = makeMeshPassSpy();
    drawWgpuRasterShape(state, makeShapeProxy({ commands: [], version: 1 }));
    drawWgpuRasterShape(state, makeShapeProxy({ commands: solidShape().data.commands, version: 1 }, null));

    expect(rasterizer).not.toHaveBeenCalled();
  });
});
