import {
  createImageResource,
  invalidateImageResource,
  registerTestImageDimensionResolver,
  unregisterTestImageDimensionResolver,
} from '@flighthq/image/contract';
import {
  beginWgpuScreenRenderPassForTest,
  bindWgpuImageResourceTexture,
  getWgpuRenderStateRuntime,
  submitWgpuFrame,
} from '@flighthq/render-wgpu/contract';
import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu/contract';
import { getOrCreateRenderProxy2D, prepareScene2DRender } from '@flighthq/render/contract';
import { appendShapeBeginFill, appendShapeRectangle, createScale9Shape } from '@flighthq/shape/contract';
import type { CanvasSurface, HostCanvasCapability, HostImageCapability } from '@flighthq/types/contract';

import {
  acquireWgpuScale9ShapeRasterSurface,
  createWgpuScale9ShapeData,
  wgpuScale9ShapeRenderer,
  destroyWgpuScale9ShapeData,
  drawWgpuScale9Shape,
  drawWgpuScale9ShapeMask,
  getWgpuScale9ShapeData,
} from './wgpuScale9Shape.ts';

// A test that wraps a host handle supplies the host: the resource measures through the registered
// resolver, and clearing after each test keeps this file from covering for another's missing one.
beforeEach(() => {
  registerTestImageDimensionResolver();
});

afterEach(() => {
  unregisterTestImageDimensionResolver();
});

const grid = { height: 80, width: 80, x: 10, y: 10 };
const destroySurface = vi.fn();

function createTestSurface(width: number, height: number): CanvasSurface {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d')!;
  return {
    get width() {
      return canvas.width;
    },
    set width(value: number) {
      canvas.width = value;
    },
    get height() {
      return canvas.height;
    },
    set height(value: number) {
      canvas.height = value;
    },
    context,
  } as unknown as CanvasSurface;
}

beforeAll(() => {
  installWgpuMock();
});

beforeEach(() => {
  destroySurface.mockReset();
});

function createTestCanvasHost(): HostCanvasCapability {
  return {
    acquire: () => null,
    create: () => null,
    createSurface: createTestSurface,
    destroySurface,
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

describe('acquireWgpuScale9ShapeRasterSurface', () => {
  it('does not cache provider absence and retries on the next draw', () => {
    const surface = createTestSurface(1, 1);
    const createSurfaceMock = vi.fn().mockReturnValueOnce(null).mockReturnValue(surface);
    const canvasHost: HostCanvasCapability = {
      acquire: () => null,
      create: () => null,
      createSurface: createSurfaceMock,
      destroySurface,
      release() {},
    };
    const imageHost = createTestImageHost();
    const state = { canvasHost, imageHost } as never;
    const data = getWgpuScale9ShapeData(createWgpuScale9ShapeData(state, createScale9Shape(grid)))!;

    expect(acquireWgpuScale9ShapeRasterSurface(canvasHost, imageHost, data)).toBeNull();
    expect(data.surface).toBeNull();
    expect(acquireWgpuScale9ShapeRasterSurface(canvasHost, imageHost, data)).toBe(surface);
    expect(acquireWgpuScale9ShapeRasterSurface(canvasHost, imageHost, data)).toBe(surface);
    expect(createSurfaceMock).toHaveBeenCalledTimes(2);
  });

  it('presents different textures for two nodes with different content in the same frame', async () => {
    const state = await createWgpuRenderStateForTest();
    setTestHosts(state);
    const canvasHost = createTestCanvasHost();
    const imageHost = createTestImageHost();
    const firstData = getWgpuScale9ShapeData(createWgpuScale9ShapeData(state, createScale9Shape(grid)))!;
    const secondData = getWgpuScale9ShapeData(createWgpuScale9ShapeData(state, createScale9Shape(grid)))!;
    acquireWgpuScale9ShapeRasterSurface(canvasHost, imageHost, firstData);
    acquireWgpuScale9ShapeRasterSurface(canvasHost, imageHost, secondData);
    const first = firstData.surface!;
    const second = secondData.surface!;
    first.context.fillStyle = '#f00';
    first.context.fillRect(0, 0, 1, 1);
    second.context.fillStyle = '#00f';
    second.context.fillRect(0, 0, 1, 1);
    invalidateImageResource(firstData.image!);
    invalidateImageResource(secondData.image!);

    const firstEntry = bindWgpuImageResourceTexture(state, firstData.image!, false, true)!;
    const secondEntry = bindWgpuImageResourceTexture(state, secondData.image!, false, true)!;

    expect(first).not.toBe(second);
    expect(firstData.image).not.toBe(secondData.image);
    expect(firstEntry.texture).not.toBe(secondEntry.texture);
  });
});

describe('createWgpuScale9ShapeData', () => {
  it('leaves its per-node raster surface lazy', () => {
    const data = getWgpuScale9ShapeData(createWgpuScale9ShapeData({} as never, createScale9Shape(grid)))!;
    expect(data.surface).toBeNull();
  });
});

describe('destroyWgpuScale9ShapeData', () => {
  it('removes its cached texture before destroying its per-node surface, idempotently', async () => {
    const state = await createWgpuRenderStateForTest();
    setTestHosts(state);
    const data = createWgpuScale9ShapeData(state, createScale9Shape(grid));
    const shapeData = getWgpuScale9ShapeData(data)!;
    acquireWgpuScale9ShapeRasterSurface(state.canvasHost!, state.imageHost!, shapeData);
    const surface = shapeData.surface!;
    const image = shapeData.image!;
    const cache = getWgpuRenderStateRuntime(state).context.textureSourcePremultipliedTextureCache;
    const order: string[] = [];
    const destroy = vi.fn(() => order.push('texture'));
    cache.set(image, { texture: { destroy } } as never);
    destroySurface.mockImplementation(() => {
      expect(cache.has(image)).toBe(false);
      order.push('surface');
    });

    destroyWgpuScale9ShapeData(state, data);
    destroyWgpuScale9ShapeData(state, data);

    expect(destroy).toHaveBeenCalledOnce();
    expect(cache.has(image)).toBe(false);
    expect(destroySurface).toHaveBeenCalledOnce();
    expect(destroySurface).toHaveBeenCalledWith(surface);
    expect(order).toEqual(['texture', 'surface']);
  });

  it('destroys its raster surface even when it never acquired a GPU cache entry', async () => {
    const state = await createWgpuRenderStateForTest();
    setTestHosts(state);
    const data = createWgpuScale9ShapeData(state, createScale9Shape(grid));
    const shapeData = getWgpuScale9ShapeData(data)!;
    acquireWgpuScale9ShapeRasterSurface(state.canvasHost!, state.imageHost!, shapeData);
    const surface = shapeData.surface!;

    destroyWgpuScale9ShapeData(state, data);

    expect(destroySurface).toHaveBeenCalledWith(surface);
  });

  it('is a no-op when its lazy surface was never allocated', async () => {
    const state = await createWgpuRenderStateForTest();
    setTestHosts(state);
    const data = createWgpuScale9ShapeData(state, createScale9Shape(grid));

    expect(() => destroyWgpuScale9ShapeData(state, data)).not.toThrow();
    expect(destroySurface).not.toHaveBeenCalled();
  });
});

describe('drawWgpuScale9Shape', () => {
  it('returns early when commands are empty', async () => {
    const state = await createWgpuRenderStateForTest();
    setTestHosts(state);
    beginWgpuScreenRenderPassForTest(state);
    const shape = createScale9Shape(grid);
    prepareScene2DRender(state, shape);
    const renderProxy = getOrCreateRenderProxy2D(state, shape);

    expect(() => drawWgpuScale9Shape(state, renderProxy)).not.toThrow();
    submitWgpuFrame(state);
  });

  it('rasterizes and draws a filled shape without throwing', async () => {
    const state = await createWgpuRenderStateForTest();
    setTestHosts(state);
    beginWgpuScreenRenderPassForTest(state);
    const shape = createScale9Shape(grid);
    appendShapeBeginFill(shape, 0xff0000ff);
    appendShapeRectangle(shape, 0, 0, 100, 100);
    prepareScene2DRender(state, shape);
    const renderProxy = getOrCreateRenderProxy2D(state, shape);

    expect(() => drawWgpuScale9Shape(state, renderProxy)).not.toThrow();
    submitWgpuFrame(state);
  });
});

describe('drawWgpuScale9ShapeMask', () => {
  it('delegates to the Scale9 draw path', async () => {
    const state = await createWgpuRenderStateForTest();
    setTestHosts(state);
    beginWgpuScreenRenderPassForTest(state);
    const shape = createScale9Shape(grid);
    prepareScene2DRender(state, shape);
    const renderProxy = getOrCreateRenderProxy2D(state, shape);

    expect(() => drawWgpuScale9ShapeMask(state, renderProxy)).not.toThrow();
    submitWgpuFrame(state);
  });
});

describe('getWgpuScale9ShapeData', () => {
  it('recovers the per-node Scale9 renderer data', () => {
    const rendererData = createWgpuScale9ShapeData({} as never, createScale9Shape(grid));

    expect(getWgpuScale9ShapeData(rendererData)?.surface).toBeNull();
  });
});

describe('wgpuScale9ShapeRenderer', () => {
  it('wires createData, destroyData, and submit', () => {
    expect(wgpuScale9ShapeRenderer.createData).toBe(createWgpuScale9ShapeData);
    expect(wgpuScale9ShapeRenderer.destroyData).toBe(destroyWgpuScale9ShapeData);
    expect(wgpuScale9ShapeRenderer.submit).toBe(drawWgpuScale9Shape);
  });
});
