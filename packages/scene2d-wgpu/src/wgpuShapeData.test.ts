import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { createImageResource } from '@flighthq/image/contract';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu/contract';
import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu/contract';
import type { WgpuShapeRendererData } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import {
  acquireWgpuShapeRasterSurface,
  createWgpuShapeData,
  destroyWgpuShapeData,
  getWgpuShapeData,
} from './wgpuShapeData';

const destroySurface = vi.fn();

beforeAll(() => {
  installWgpuMock();
});

beforeEach(() => {
  destroySurface.mockReset();
});

function createTestRaster2DSurfaceProvider() {
  return {
    [EntityRuntimeKey]: undefined,
    createRaster2DSurface(width: number, height: number) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d')!;
      return {
        [EntityRuntimeKey]: undefined,
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
        image: createImageResource(canvas),
      };
    },
    destroyRaster2DSurface: destroySurface,
  };
}

function emptyData(): WgpuShapeRendererData {
  const out = allocateEntity<WgpuShapeRendererData>();
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
    const provider = createTestRaster2DSurfaceProvider();
    const data = emptyData();
    const first = acquireWgpuShapeRasterSurface(provider, data);
    expect(data.surface).toBe(first);
    expect(acquireWgpuShapeRasterSurface(provider, data)).toBe(first);
  });

  it('wraps the canvas as an Image so the quad batch treats it like any other texture source', () => {
    const surface = acquireWgpuShapeRasterSurface(createTestRaster2DSurfaceProvider(), emptyData())!;
    expect(surface.image.source).toBe(surface.context.canvas);
    expect('canvas' in surface).toBe(false);
  });

  it('preserves expected absence without caching it when the provider refuses', () => {
    const provider = {
      [EntityRuntimeKey]: undefined,
      createRaster2DSurface: () => null,
      destroyRaster2DSurface: destroySurface,
    };
    const data = emptyData();
    expect(acquireWgpuShapeRasterSurface(provider, data)).toBeNull();
    expect(data.surface).toBeNull();
  });
});

describe('createWgpuShapeData', () => {
  it('allocates no canvas up front, so a mesh-only scene carries none', async () => {
    const state = await createWgpuRenderStateForTest();
    state.raster2DSurfaceProvider = createTestRaster2DSurfaceProvider();
    const data = getWgpuShapeData(createWgpuShapeData(state, {} as never))!;
    expect(data.surface).toBeNull();
    expect(data.meshes).toBeNull();
    expect(data.meshVersion).toBe(-1);
  });
});

describe('destroyWgpuShapeData', () => {
  it('does nothing when the shape only ever tessellated, since there is no surface to free', async () => {
    const state = await createWgpuRenderStateForTest();
    state.raster2DSurfaceProvider = createTestRaster2DSurfaceProvider();
    const data = createWgpuShapeData(state, {} as never);
    expect(() => destroyWgpuShapeData(state, data)).not.toThrow();
    expect(destroySurface).not.toHaveBeenCalled();
  });

  it('destroys the cached GPU texture before the raster surface, then frees the mesh buffers', async () => {
    const state = await createWgpuRenderStateForTest();
    state.raster2DSurfaceProvider = createTestRaster2DSurfaceProvider();
    const data = createWgpuShapeData(state, {} as never);
    const shapeData = getWgpuShapeData(data)!;
    const surface = acquireWgpuShapeRasterSurface(state.raster2DSurfaceProvider!, shapeData)!;
    const cache = getWgpuRenderStateRuntime(state).context.textureSourcePremultipliedTextureCache;
    const order: string[] = [];
    const destroy = vi.fn(() => order.push('texture'));
    cache.set(surface.image, {
      texture: { destroy },
    } as never);
    destroySurface.mockImplementation((destroyed) => {
      expect(cache.has(destroyed.image)).toBe(false);
      order.push('surface');
    });
    const bufferDestroy = vi.fn(() => order.push('buffer'));
    shapeData.meshBuffers.vertexBuffers.push({ destroy: bufferDestroy } as never);
    shapeData.meshBuffers.colorScaleBiasUniformBuffers.push({ destroy: bufferDestroy } as never);

    destroyWgpuShapeData(state, data);

    expect(destroy).toHaveBeenCalledOnce();
    expect(destroySurface).toHaveBeenCalledWith(surface);
    expect(bufferDestroy).toHaveBeenCalledTimes(2);
    expect(cache.has(surface.image)).toBe(false);
    expect(order).toEqual(['texture', 'surface', 'buffer', 'buffer']);
    expect(shapeData.meshBuffers.vertexBuffers).toHaveLength(0);
    expect(shapeData.meshBuffers.colorScaleBiasUniformBuffers).toHaveLength(0);
  });

  it('destroys a raster surface even when it never acquired a GPU cache entry', async () => {
    const state = await createWgpuRenderStateForTest();
    state.raster2DSurfaceProvider = createTestRaster2DSurfaceProvider();
    const data = createWgpuShapeData(state, {} as never);
    const shapeData = getWgpuShapeData(data)!;
    const surface = acquireWgpuShapeRasterSurface(state.raster2DSurfaceProvider!, shapeData)!;

    destroyWgpuShapeData(state, data);

    expect(destroySurface).toHaveBeenCalledWith(surface);
  });
});

describe('getWgpuShapeData', () => {
  it('reads the shape data back out of the opaque RendererData slot', async () => {
    const state = await createWgpuRenderStateForTest();
    state.raster2DSurfaceProvider = createTestRaster2DSurfaceProvider();
    const data = createWgpuShapeData(state, {} as never);
    expect(getWgpuShapeData(data)?.meshVersion).toBe(-1);
  });
});
