import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import {
  createImageResource,
  registerTestImageDimensionResolver,
  unregisterTestImageDimensionResolver,
} from '@flighthq/image/contract';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu/contract';
import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu/contract';
import type {
  CanvasSurface,
  HostCanvasCapability,
  HostImageCapability,
  WgpuShapeRendererData,
} from '@flighthq/types/contract';

import {
  acquireWgpuShapeRasterSurface,
  createWgpuShapeData,
  destroyWgpuShapeData,
  getWgpuShapeData,
} from './wgpuShapeData';

// A test that wraps a host handle supplies the host: the resource measures through the registered
// resolver, and clearing after each test keeps this file from covering for another's missing one.
beforeEach(() => {
  registerTestImageDimensionResolver();
});

afterEach(() => {
  unregisterTestImageDimensionResolver();
});

const destroySurface = vi.fn();

beforeAll(() => {
  installWgpuMock();
});

beforeEach(() => {
  destroySurface.mockReset();
});

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

function emptyData(): WgpuShapeRendererData {
  const out = allocateEntity<WgpuShapeRendererData>();
  out.image = null;
  out.surface = null;
  out.lastContentId = -1;
  out.lastPixelRatio = 0;
  out.lastW = 0;
  out.lastH = 0;
  out.meshVersion = -1;
  out.meshes = null;
  out.meshBuffers = {
    vertexBuffers: [],
    vertexCapacities: [],
    indexBuffers: [],
    indexCapacities: [],
    uniformBuffers: [],
    bindGroups: [],
    colorScaleBiasUniformBuffers: [],
    colorScaleBiasBindGroups: [],
  };
  return finishEntity(out);
}

describe('acquireWgpuShapeRasterSurface', () => {
  it('allocates once and returns the same surface thereafter', () => {
    const canvasHost = createTestCanvasHost();
    const imageHost = createTestImageHost();
    const data = emptyData();
    const first = acquireWgpuShapeRasterSurface(canvasHost, imageHost, data);
    expect(data.surface).toBe(first);
    expect(acquireWgpuShapeRasterSurface(canvasHost, imageHost, data)).toBe(first);
  });

  it('wraps the canvas as an Image so the quad batch treats it like any other texture source', () => {
    const canvasHost = createTestCanvasHost();
    const imageHost = createTestImageHost();
    const data = emptyData();
    acquireWgpuShapeRasterSurface(canvasHost, imageHost, data);
    const surface = data.surface!;
    const image = data.image!;
    expect(image.source).toBe((surface as unknown as { context: CanvasRenderingContext2D }).context.canvas);
  });

  it('preserves expected absence without caching it when the provider refuses', () => {
    const canvasHost: HostCanvasCapability = {
      acquire: () => null,
      create: () => null,
      createSurface: () => null,
      destroySurface,
      release() {},
    };
    const imageHost = createTestImageHost();
    const data = emptyData();
    expect(acquireWgpuShapeRasterSurface(canvasHost, imageHost, data)).toBeNull();
    expect(data.surface).toBeNull();
  });
});

describe('createWgpuShapeData', () => {
  it('allocates no canvas up front, so a mesh-only scene carries none', async () => {
    const state = await createWgpuRenderStateForTest();
    setTestHosts(state);
    const data = getWgpuShapeData(createWgpuShapeData(state, {} as never))!;
    expect(data.surface).toBeNull();
    expect(data.meshes).toBeNull();
    expect(data.meshVersion).toBe(-1);
  });
});

describe('destroyWgpuShapeData', () => {
  it('does nothing when the shape only ever tessellated, since there is no surface to free', async () => {
    const state = await createWgpuRenderStateForTest();
    setTestHosts(state);
    const data = createWgpuShapeData(state, {} as never);
    expect(() => destroyWgpuShapeData(state, data)).not.toThrow();
    expect(destroySurface).not.toHaveBeenCalled();
  });

  it('destroys the cached GPU texture before the raster surface, then frees the mesh buffers', async () => {
    const state = await createWgpuRenderStateForTest();
    setTestHosts(state);
    const data = createWgpuShapeData(state, {} as never);
    const shapeData = getWgpuShapeData(data)!;
    acquireWgpuShapeRasterSurface(state.canvasHost!, state.imageHost!, shapeData);
    const surface = shapeData.surface!;
    const image = shapeData.image!;
    const cache = getWgpuRenderStateRuntime(state).context.textureSourcePremultipliedTextureCache;
    const order: string[] = [];
    const destroy = vi.fn(() => order.push('texture'));
    cache.set(image, {
      texture: { destroy },
    } as never);
    destroySurface.mockImplementation(() => {
      expect(cache.has(image)).toBe(false);
      order.push('surface');
    });
    const bufferDestroy = vi.fn(() => order.push('buffer'));
    shapeData.meshBuffers.vertexBuffers.push({ destroy: bufferDestroy } as never);
    shapeData.meshBuffers.colorScaleBiasUniformBuffers.push({ destroy: bufferDestroy } as never);

    destroyWgpuShapeData(state, data);

    expect(destroy).toHaveBeenCalledOnce();
    expect(destroySurface).toHaveBeenCalledWith(surface);
    expect(bufferDestroy).toHaveBeenCalledTimes(2);
    expect(cache.has(image)).toBe(false);
    expect(order).toEqual(['texture', 'surface', 'buffer', 'buffer']);
    expect(shapeData.meshBuffers.vertexBuffers).toHaveLength(0);
    expect(shapeData.meshBuffers.colorScaleBiasUniformBuffers).toHaveLength(0);
  });

  it('destroys a raster surface even when it never acquired a GPU cache entry', async () => {
    const state = await createWgpuRenderStateForTest();
    setTestHosts(state);
    const data = createWgpuShapeData(state, {} as never);
    const shapeData = getWgpuShapeData(data)!;
    acquireWgpuShapeRasterSurface(state.canvasHost!, state.imageHost!, shapeData);
    const surface = shapeData.surface!;

    destroyWgpuShapeData(state, data);

    expect(destroySurface).toHaveBeenCalledWith(surface);
  });
});

describe('getWgpuShapeData', () => {
  it('reads the shape data back out of the opaque RendererData slot', async () => {
    const state = await createWgpuRenderStateForTest();
    setTestHosts(state);
    const data = createWgpuShapeData(state, {} as never);
    expect(getWgpuShapeData(data)?.meshVersion).toBe(-1);
  });
});
