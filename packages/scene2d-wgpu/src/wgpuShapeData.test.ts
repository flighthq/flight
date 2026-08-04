import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu/contract';
import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu/contract';
import type { WgpuShapeRendererData } from '@flighthq/types/contract';

import {
  acquireWgpuShapeRasterSurface,
  createWgpuShapeData,
  destroyWgpuShapeData,
  getWgpuShapeData,
} from './wgpuShapeData';

beforeAll(() => {
  installWgpuMock();
});

function emptyData(): WgpuShapeRendererData {
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

describe('acquireWgpuShapeRasterSurface', () => {
  it('allocates once and returns the same surface thereafter', () => {
    const data = emptyData();
    const first = acquireWgpuShapeRasterSurface(data);
    expect(data.surface).toBe(first);
    expect(acquireWgpuShapeRasterSurface(data)).toBe(first);
  });

  it('wraps the canvas as an Image so the quad batch treats it like any other texture source', () => {
    const surface = acquireWgpuShapeRasterSurface(emptyData());
    expect(surface.image.source).toBe(surface.canvas);
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
  });

  it('destroys the cached GPU texture keyed on the raster surface, and the mesh buffers', async () => {
    const state = await createWgpuRenderStateForTest();
    const data = createWgpuShapeData(state, {} as never);
    const shapeData = getWgpuShapeData(data)!;
    const surface = acquireWgpuShapeRasterSurface(shapeData);
    const destroy = vi.fn();
    getWgpuRenderStateRuntime(state).textureSourcePremultipliedTextureCache.set(surface.image, {
      texture: { destroy },
    } as never);
    const bufferDestroy = vi.fn();
    shapeData.meshBuffers.vertexBuffers.push({ destroy: bufferDestroy } as never);
    shapeData.meshBuffers.colorScaleBiasUniformBuffers.push({ destroy: bufferDestroy } as never);

    destroyWgpuShapeData(state, data);

    expect(destroy).toHaveBeenCalled();
    expect(bufferDestroy).toHaveBeenCalled();
    expect(shapeData.meshBuffers.vertexBuffers).toHaveLength(0);
    expect(shapeData.meshBuffers.colorScaleBiasUniformBuffers).toHaveLength(0);
  });
});

describe('getWgpuShapeData', () => {
  it('reads the shape data back out of the opaque RendererData slot', async () => {
    const state = await createWgpuRenderStateForTest();
    const data = createWgpuShapeData(state, {} as never);
    expect(getWgpuShapeData(data)?.meshVersion).toBe(-1);
  });
});
