import { createImageResource } from '@flighthq/image/contract';
import type * as FlightNodeModule from '@flighthq/node/contract';
import { renderWgpuBackground, submitWgpuRenderPass } from '@flighthq/render-wgpu/contract';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu/contract';
import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu/contract';
import { resetRaster2DSurfaceProviderForTest, setRaster2DSurfaceProvider } from '@flighthq/render/contract';
import {
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapePath,
  appendShapeLineStyle,
  appendShapeLineTo,
  appendShapeMoveTo,
  appendShapeRectangle,
  createShape,
} from '@flighthq/shape/contract';
import type { RenderProxy2D } from '@flighthq/types/contract';
import { BatchFormat, PathCommand } from '@flighthq/types/contract';

import { enableWgpuStrokePathTessellation } from './enableWgpuStrokePathTessellation';
// @flighthq/node's bounds/revision queries expect a real BoundsNode; these tests drive drawWgpuShape with
// lightweight fake proxies, so the two queries are stubbed.
//
// ★ A HOISTED MOCK, NOT A HAND-ROLLED ONE. This file is in REGISTRY_ISOLATED_TESTS, so it already runs
// with its own module registry — the hermeticity the `scopeModuleMocks` + `vi.doMock` + dynamic-import
// dance bought by hand comes from the platform here, with no hook, and the stub cannot reach the many
// real consumers of these functions (node, interaction, shape, text). The dance was not merely
// redundant: it rebuilt the subject's entire transitive module graph inside a FIXED `beforeAll`
// deadline, which is unbounded work against a fixed clock and the shape of flake tiering exists to remove.
vi.mock('@flighthq/node/contract', async (importOriginal) => ({
  ...(await importOriginal<typeof FlightNodeModule>()),
  getNodeLocalBoundsRectangle: () => ({ x: 0, y: 0, width: 64, height: 48 }),
  getNodeLocalContentRevision: (source: { data?: { version?: number } } | null | undefined) =>
    source?.data?.version ?? 0,
}));

import { defaultWgpuMorphShapeRenderer, defaultWgpuShapeRenderer, drawWgpuShape } from './wgpuShape';
import { registerWgpuShapeRasterizer } from './wgpuShapeRasterizer';
import { registerWgpuStandardMaterial } from './wgpuStandardMaterial';

const noopRasterizer = (): void => {};

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
  });
});

afterEach(() => {
  resetRaster2DSurfaceProviderForTest();
});

// Mirrors createWgpuShapeData: the rasterization surface is absent until a shape actually needs one,
// so a scene drawn entirely through the mesh path carries no canvases.
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

describe('defaultWgpuShapeRenderer', () => {
  it('provides the MorphShape renderer alias', () => {
    expect(defaultWgpuMorphShapeRenderer).toBe(defaultWgpuShapeRenderer);
  });

  it('declares BatchFormat.Quad', () => {
    expect(defaultWgpuShapeRenderer.format).toBe(BatchFormat.Quad);
  });

  it('has createData and submit functions', () => {
    expect(typeof defaultWgpuShapeRenderer.createData).toBe('function');
    expect(typeof defaultWgpuShapeRenderer.submit).toBe('function');
  });
});

describe('drawWgpuShape', () => {
  it('draws a solid fill and open solid stroke as GPU meshes in one shape', async () => {
    const state = await createWgpuRenderStateForTest();
    registerWgpuShapeRasterizer(state, noopRasterizer);
    renderWgpuBackground(state);
    getWgpuRenderStateRuntime(state).renderPass = makeMeshPassSpy();
    const shape = createShape();
    appendShapeBeginFill(shape, 0x00cc00ff);
    appendShapeRectangle(shape, 8, 8, 32, 24);
    appendShapeEndFill(shape);
    appendShapeLineStyle(shape, 4, 0xff0000ff);
    appendShapeMoveTo(shape, 8, 4);
    appendShapeLineTo(shape, 40, 4);
    const rendererData = defaultWgpuShapeRenderer.createData!(state, shape)!;

    drawWgpuShape(state, makeShapeProxy({ commands: shape.data.commands, version: 1 }, rendererData));

    const pass = getWgpuRenderStateRuntime(state).renderPass as unknown as {
      drawIndexed: ReturnType<typeof vi.fn>;
    };
    expect(pass.drawIndexed).toHaveBeenCalledTimes(2);
    expect(getWgpuRenderStateRuntime(state).quadBatchWriterCount).toBe(0);
    submitWgpuRenderPass(state);
  });

  it('draws a closed solid stroke ring as one GPU mesh', async () => {
    const state = await createWgpuRenderStateForTest();
    registerWgpuShapeRasterizer(state, noopRasterizer);
    enableWgpuStrokePathTessellation(state);
    renderWgpuBackground(state);
    getWgpuRenderStateRuntime(state).renderPass = makeMeshPassSpy();
    const shape = createShape();
    appendShapeLineStyle(shape, 8, 0xff0000ff);
    appendShapeRectangle(shape, 8, 8, 32, 24);
    const rendererData = defaultWgpuShapeRenderer.createData!(state, shape)!;

    drawWgpuShape(state, makeShapeProxy({ commands: shape.data.commands, version: 1 }, rendererData));

    const pass = getWgpuRenderStateRuntime(state).renderPass as unknown as {
      drawIndexed: ReturnType<typeof vi.fn>;
    };
    expect(pass.drawIndexed).toHaveBeenCalledTimes(1);
    expect(getWgpuRenderStateRuntime(state).quadBatchWriterCount).toBe(0);
    submitWgpuRenderPass(state);
  });

  it('keeps a closed stroke on the raster lane until stroke-path tessellation is enabled', async () => {
    const state = await createWgpuRenderStateForTest();
    registerWgpuShapeRasterizer(state, noopRasterizer);
    renderWgpuBackground(state);
    registerWgpuStandardMaterial(state);
    const pass = makeMeshPassSpy();
    getWgpuRenderStateRuntime(state).renderPass = pass;
    const shape = createShape();
    appendShapeLineStyle(shape, 8, 0xff0000ff);
    appendShapeRectangle(shape, 8, 8, 32, 24);
    const rendererData = defaultWgpuShapeRenderer.createData!(state, shape)!;

    drawWgpuShape(state, makeShapeProxy({ commands: shape.data.commands, version: 1 }, rendererData));

    expect(pass.drawIndexed).not.toHaveBeenCalled();
    expect(getWgpuRenderStateRuntime(state).quadBatchWriterCount).toBe(1);
    submitWgpuRenderPass(state);
  });

  it('falls back to the raster quad for a self-intersecting stroke centerline', async () => {
    const state = await createWgpuRenderStateForTest();
    registerWgpuShapeRasterizer(state, noopRasterizer);
    enableWgpuStrokePathTessellation(state);
    renderWgpuBackground(state);
    registerWgpuStandardMaterial(state);
    const pass = makeMeshPassSpy();
    getWgpuRenderStateRuntime(state).renderPass = pass;
    const shape = createShape();
    appendShapeLineStyle(shape, 8, 0xff0000ff);
    appendShapePath(
      shape,
      [PathCommand.MOVE_TO, PathCommand.LINE_TO, PathCommand.LINE_TO, PathCommand.LINE_TO, PathCommand.CLOSE],
      [8, 8, 40, 40, 8, 40, 40, 8],
      'nonZero',
    );
    const rendererData = defaultWgpuShapeRenderer.createData!(state, shape)!;
    const proxy = makeShapeProxy({ commands: shape.data.commands, version: 1 }, rendererData);

    drawWgpuShape(state, proxy);
    // The first draw rasterized, so the surface exists by now — it is allocated on demand, not with the node.
    const surface = (rendererData as unknown as { surface: { width: number; height: number } }).surface;
    let surfaceWidth = surface.width;
    let surfaceHeight = surface.height;
    const setWidth = vi.fn((value: number) => (surfaceWidth = value));
    const setHeight = vi.fn((value: number) => (surfaceHeight = value));
    Object.defineProperty(surface, 'width', { configurable: true, get: () => surfaceWidth, set: setWidth });
    Object.defineProperty(surface, 'height', { configurable: true, get: () => surfaceHeight, set: setHeight });
    (proxy.source as unknown as { data: { version: number } }).data.version = 2;
    drawWgpuShape(state, proxy);

    expect(pass.drawIndexed).not.toHaveBeenCalled();
    expect(getWgpuRenderStateRuntime(state).quadBatchWriterCount).toBe(2);
    expect(setWidth).not.toHaveBeenCalled();
    expect(setHeight).not.toHaveBeenCalled();
    submitWgpuRenderPass(state);
  });

  it('returns early without writing to batch when commands are empty', async () => {
    const state = await createWgpuRenderStateForTest();
    registerWgpuShapeRasterizer(state, noopRasterizer);
    renderWgpuBackground(state);
    registerWgpuStandardMaterial(state);
    drawWgpuShape(state, makeShapeProxy({ commands: [] }, makeShapeData()));
    expect(getWgpuRenderStateRuntime(state).quadBatchWriterCount).toBe(0);
    submitWgpuRenderPass(state);
  });

  it('returns early without writing to batch when rendererData is null', async () => {
    const state = await createWgpuRenderStateForTest();
    registerWgpuShapeRasterizer(state, noopRasterizer);
    renderWgpuBackground(state);
    registerWgpuStandardMaterial(state);
    drawWgpuShape(state, makeShapeProxy({ commands: [{}] }, null));
    expect(getWgpuRenderStateRuntime(state).quadBatchWriterCount).toBe(0);
    submitWgpuRenderPass(state);
  });

  it('does not throw when renderPass is null', async () => {
    const state = await createWgpuRenderStateForTest();
    registerWgpuShapeRasterizer(state, noopRasterizer);
    expect(() => drawWgpuShape(state, makeShapeProxy({ commands: [{}] }, makeShapeData()))).not.toThrow();
  });

  it('writes one instance to the quad-batch writer when shape has valid commands and bounds', async () => {
    const state = await createWgpuRenderStateForTest();
    registerWgpuShapeRasterizer(state, noopRasterizer);
    renderWgpuBackground(state);
    registerWgpuStandardMaterial(state);
    drawWgpuShape(state, makeShapeProxy({ commands: [{}], version: 1 }, makeShapeData()));
    expect(getWgpuRenderStateRuntime(state).quadBatchWriterCount).toBe(1);
    submitWgpuRenderPass(state);
  });
});
