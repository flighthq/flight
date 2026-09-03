import { createEntity } from '@flighthq/entity/contract';
import { createImageResource } from '@flighthq/image/contract';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu/contract';
import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu/contract';
import { resetRaster2DSurfaceProviderForTest, setRaster2DSurfaceProvider } from '@flighthq/render/contract';
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
  setRaster2DSurfaceProvider({
    [EntityRuntimeKey]: undefined,
    createRaster2DSurface(width, height) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d')!;
      return {
        [EntityRuntimeKey]: undefined,
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
    destroyRaster2DSurface: destroySurface,
  });
});

afterEach(() => {
  resetRaster2DSurfaceProviderForTest();
});

function emptyData(): WgpuShapeRendererData {
  return createEntity({
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
  });
}

describe('acquireWgpuShapeRasterSurface', () => {
  it('allocates once and returns the same surface thereafter', () => {
    const data = emptyData();
    const first = acquireWgpuShapeRasterSurface(data);
    expect(data.surface).toBe(first);
    expect(acquireWgpuShapeRasterSurface(data)).toBe(first);
  });

  it('wraps the canvas as an Image so the quad batch treats it like any other texture source', () => {
    const surface = acquireWgpuShapeRasterSurface(emptyData())!;
    expect(surface.image.source).toBe(surface.context.canvas);
    expect('canvas' in surface).toBe(false);
  });

  it('preserves expected absence without caching it when no provider is installed', () => {
    resetRaster2DSurfaceProviderForTest();
    const data = emptyData();
    expect(acquireWgpuShapeRasterSurface(data)).toBeNull();
    expect(data.surface).toBeNull();
  });
});

describe('createWgpuShapeData', () => {
  it('allocates no canvas up front, so a mesh-only scene carries none', async () => {
    const state = await createWgpuRenderStateForTest();
    const data = getWgpuShapeData(createWgpuShapeData(state, {} as never))!;
    expect(data.surface).toBeNull();
    expect(data.meshes).toBeNull();
    expect(data.meshVersion).toBe(-1);
  });
});

describe('destroyWgpuShapeData', () => {
  it('does nothing when the shape only ever tessellated, since there is no surface to free', async () => {
    const state = await createWgpuRenderStateForTest();
    const data = createWgpuShapeData(state, {} as never);
    expect(() => destroyWgpuShapeData(state, data)).not.toThrow();
    expect(destroySurface).not.toHaveBeenCalled();
  });

  it('destroys the cached GPU texture before the raster surface, then frees the mesh buffers', async () => {
    const state = await createWgpuRenderStateForTest();
    const data = createWgpuShapeData(state, {} as never);
    const shapeData = getWgpuShapeData(data)!;
    const surface = acquireWgpuShapeRasterSurface(shapeData)!;
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
    const data = createWgpuShapeData(state, {} as never);
    const shapeData = getWgpuShapeData(data)!;
    const surface = acquireWgpuShapeRasterSurface(shapeData)!;

    destroyWgpuShapeData(state, data);

    expect(destroySurface).toHaveBeenCalledWith(surface);
  });
});

describe('getWgpuShapeData', () => {
  it('reads the shape data back out of the opaque RendererData slot', async () => {
    const state = await createWgpuRenderStateForTest();
    const data = createWgpuShapeData(state, {} as never);
    expect(getWgpuShapeData(data)?.meshVersion).toBe(-1);
  });
});
