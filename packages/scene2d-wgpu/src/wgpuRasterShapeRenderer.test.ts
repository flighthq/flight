import {
  createImageResource,
  registerTestImageDimensionResolver,
  unregisterTestImageDimensionResolver,
} from '@flighthq/image/contract';
import * as flightNode from '@flighthq/node/contract';
import {
  beginWgpuScreenRenderPassForTest,
  createWgpuRenderStateForTest,
  getWgpuRenderStateRuntime,
  installWgpuMock,
} from '@flighthq/render-wgpu/contract';
import { enableRenderRegistriesGuards, explainRenderRegistriesMisses } from '@flighthq/render/contract';
import { appendShapeBeginFill, appendShapeEndFill, appendShapeRectangle, createShape } from '@flighthq/shape/contract';
import type { CanvasSurface, HostCanvasCapability, HostImageCapability, RenderProxy2D } from '@flighthq/types/contract';
import { BatchFormat, RenderRegistryTable } from '@flighthq/types/contract';

import { wgpuRasterShapeRenderer, drawWgpuRasterShape } from './wgpuRasterShapeRenderer';
import { registerWgpuShapeRasterizer } from './wgpuShapeRasterizer';
import { registerWgpuStandardMaterial } from './wgpuStandardMaterial';

// A test that wraps a host handle supplies the host: the resource measures through the registered
// resolver, and clearing after each test keeps this file from covering for another's missing one.
beforeEach(() => {
  registerTestImageDimensionResolver();
});

afterEach(() => {
  unregisterTestImageDimensionResolver();
});

beforeAll(() => installWgpuMock());

beforeEach(() => {
  vi.spyOn(flightNode, 'getNodeLocalBoundsRectangle').mockImplementation((() => ({
    x: 0,
    y: 0,
    width: 64,
    height: 48,
  })) as never);
  vi.spyOn(flightNode, 'getNodeLocalContentRevision').mockImplementation(
    ((source: { data?: { version?: number } } | null | undefined) => source?.data?.version ?? 0) as never,
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

function createTestSurface(width: number, height: number): CanvasSurface {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return { context: canvas.getContext('2d')! } as unknown as CanvasSurface;
}

function createTestCanvasHost(): HostCanvasCapability {
  return {
    acquire: () => null,
    create: () => null,
    createSurface: createTestSurface,
    destroySurface() {},
    release() {},
  };
}

function createTestImageHost(): HostImageCapability {
  return {
    createImageFromSurface(surface) {
      return createImageResource((surface as unknown as { context: CanvasRenderingContext2D }).context.canvas);
    },
    loadImageFromUrl: () => Promise.reject(new Error('not implemented')),
  };
}

function setTestHosts(state: { canvasHost: unknown; imageHost: unknown }): void {
  state.canvasHost = createTestCanvasHost();
  state.imageHost = createTestImageHost();
}

function makeShapeData() {
  return {
    image: null,
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

describe('drawWgpuRasterShape', () => {
  it('rasterizes a fill the mesh path could have tessellated, which is what pinning this strategy means', async () => {
    const state = await createWgpuRenderStateForTest();
    setTestHosts(state);
    beginWgpuScreenRenderPassForTest(state);
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
    setTestHosts(state);
    beginWgpuScreenRenderPassForTest(state);
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
    setTestHosts(state);
    beginWgpuScreenRenderPassForTest(state);
    getWgpuRenderStateRuntime(state).renderPass = makeMeshPassSpy();
    enableRenderRegistriesGuards(state);

    drawWgpuRasterShape(state, makeShapeProxy({ commands: solidShape().data.commands, version: 1 }));

    expect(explainRenderRegistriesMisses(state).misses).toContainEqual({
      kind: 'Shape',
      registry: RenderRegistryTable.ShapeRasterizer,
    });
  });

  it('preserves expected surface absence without rasterizing or writing a batch', async () => {
    const state = await createWgpuRenderStateForTest();
    beginWgpuScreenRenderPassForTest(state);
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
    setTestHosts(state);
    beginWgpuScreenRenderPassForTest(state);
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

describe('wgpuRasterShapeRenderer', () => {
  it('declares BatchFormat.Quad and the shared shape data lifecycle', () => {
    expect(wgpuRasterShapeRenderer.format).toBe(BatchFormat.Quad);
    expect(typeof wgpuRasterShapeRenderer.createData).toBe('function');
    expect(typeof wgpuRasterShapeRenderer.destroyData).toBe('function');
    expect(wgpuRasterShapeRenderer.submit).toBe(drawWgpuRasterShape);
  });
});
