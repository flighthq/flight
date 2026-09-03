import { createImageResource, invalidateImageResource } from '@flighthq/image/contract';
import {
  bindWgpuImageResourceTexture,
  getWgpuRenderStateRuntime,
  renderWgpuBackground,
  submitWgpuRenderPass,
} from '@flighthq/render-wgpu/contract';
import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu/contract';
import {
  getOrCreateRenderProxy2D,
  prepareScene2DRender,
  resetRaster2DSurfaceProviderForTest,
  setRaster2DSurfaceProvider,
} from '@flighthq/render/contract';
import { appendShapeBeginFill, appendShapeRectangle, createScale9Shape } from '@flighthq/shape/contract';
import type { Raster2DSurface } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import {
  acquireWgpuScale9ShapeRasterSurface,
  createWgpuScale9ShapeData,
  defaultWgpuScale9ShapeRenderer,
  destroyWgpuScale9ShapeData,
  drawWgpuScale9Shape,
  drawWgpuScale9ShapeMask,
  getWgpuScale9ShapeData,
} from './wgpuScale9Shape';

const grid = { height: 80, width: 80, x: 10, y: 10 };
const destroySurface = vi.fn();

function createTestSurface(width = 1, height = 1): Raster2DSurface {
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
}

beforeAll(() => {
  installWgpuMock();
});

beforeEach(() => {
  destroySurface.mockReset();
  setRaster2DSurfaceProvider({
    [EntityRuntimeKey]: undefined,
    createRaster2DSurface: createTestSurface,
    destroyRaster2DSurface: destroySurface,
  });
});

afterEach(() => {
  resetRaster2DSurfaceProviderForTest();
});

describe('acquireWgpuScale9ShapeRasterSurface', () => {
  it('does not cache provider absence and retries on the next draw', () => {
    const surface = createTestSurface();
    const createSurface = vi.fn().mockReturnValueOnce(null).mockReturnValue(surface);
    setRaster2DSurfaceProvider({
      [EntityRuntimeKey]: undefined,
      createRaster2DSurface: createSurface,
      destroyRaster2DSurface: destroySurface,
    });
    const data = getWgpuScale9ShapeData(createWgpuScale9ShapeData({} as never, createScale9Shape(grid)))!;

    expect(acquireWgpuScale9ShapeRasterSurface(data)).toBeNull();
    expect(data.surface).toBeNull();
    expect(acquireWgpuScale9ShapeRasterSurface(data)).toBe(surface);
    expect(acquireWgpuScale9ShapeRasterSurface(data)).toBe(surface);
    expect(createSurface).toHaveBeenCalledTimes(2);
  });

  it('presents different textures for two nodes with different content in the same frame', async () => {
    const state = await createWgpuRenderStateForTest();
    const firstData = getWgpuScale9ShapeData(createWgpuScale9ShapeData(state, createScale9Shape(grid)))!;
    const secondData = getWgpuScale9ShapeData(createWgpuScale9ShapeData(state, createScale9Shape(grid)))!;
    const first = acquireWgpuScale9ShapeRasterSurface(firstData)!;
    const second = acquireWgpuScale9ShapeRasterSurface(secondData)!;
    first.context.fillStyle = '#f00';
    first.context.fillRect(0, 0, 1, 1);
    second.context.fillStyle = '#00f';
    second.context.fillRect(0, 0, 1, 1);
    invalidateImageResource(first.image);
    invalidateImageResource(second.image);

    const firstEntry = bindWgpuImageResourceTexture(state, first.image, false, true)!;
    const secondEntry = bindWgpuImageResourceTexture(state, second.image, false, true)!;

    expect(first).not.toBe(second);
    expect(first.image).not.toBe(second.image);
    expect(firstEntry.texture).not.toBe(secondEntry.texture);
  });
});

describe('createWgpuScale9ShapeData', () => {
  it('leaves its per-node raster surface lazy', () => {
    const data = getWgpuScale9ShapeData(createWgpuScale9ShapeData({} as never, createScale9Shape(grid)))!;
    expect(data.surface).toBeNull();
  });
});

describe('defaultWgpuScale9ShapeRenderer', () => {
  it('wires createData, destroyData, and submit', () => {
    expect(defaultWgpuScale9ShapeRenderer.createData).toBe(createWgpuScale9ShapeData);
    expect(defaultWgpuScale9ShapeRenderer.destroyData).toBe(destroyWgpuScale9ShapeData);
    expect(defaultWgpuScale9ShapeRenderer.submit).toBe(drawWgpuScale9Shape);
  });
});

describe('destroyWgpuScale9ShapeData', () => {
  it('removes its cached texture before destroying its per-node surface, idempotently', async () => {
    const state = await createWgpuRenderStateForTest();
    const data = createWgpuScale9ShapeData(state, createScale9Shape(grid));
    const surface = acquireWgpuScale9ShapeRasterSurface(getWgpuScale9ShapeData(data)!)!;
    const cache = getWgpuRenderStateRuntime(state).context.textureSourcePremultipliedTextureCache;
    const order: string[] = [];
    const destroy = vi.fn(() => order.push('texture'));
    cache.set(surface.image, { texture: { destroy } } as never);
    destroySurface.mockImplementation((destroyed) => {
      expect(cache.has(destroyed.image)).toBe(false);
      order.push('surface');
    });

    destroyWgpuScale9ShapeData(state, data);
    destroyWgpuScale9ShapeData(state, data);

    expect(destroy).toHaveBeenCalledOnce();
    expect(cache.has(surface.image)).toBe(false);
    expect(destroySurface).toHaveBeenCalledOnce();
    expect(destroySurface).toHaveBeenCalledWith(surface);
    expect(order).toEqual(['texture', 'surface']);
  });

  it('destroys its raster surface even when it never acquired a GPU cache entry', async () => {
    const state = await createWgpuRenderStateForTest();
    const data = createWgpuScale9ShapeData(state, createScale9Shape(grid));
    const surface = acquireWgpuScale9ShapeRasterSurface(getWgpuScale9ShapeData(data)!)!;

    destroyWgpuScale9ShapeData(state, data);

    expect(destroySurface).toHaveBeenCalledWith(surface);
  });

  it('is a no-op when its lazy surface was never allocated', async () => {
    const state = await createWgpuRenderStateForTest();
    const data = createWgpuScale9ShapeData(state, createScale9Shape(grid));

    expect(() => destroyWgpuScale9ShapeData(state, data)).not.toThrow();
    expect(destroySurface).not.toHaveBeenCalled();
  });
});

describe('drawWgpuScale9Shape', () => {
  it('returns early when commands are empty', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    const shape = createScale9Shape(grid);
    prepareScene2DRender(state, shape);
    const renderProxy = getOrCreateRenderProxy2D(state, shape);

    expect(() => drawWgpuScale9Shape(state, renderProxy)).not.toThrow();
    submitWgpuRenderPass(state);
  });

  it('rasterizes and draws a filled shape without throwing', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    const shape = createScale9Shape(grid);
    appendShapeBeginFill(shape, 0xff0000ff);
    appendShapeRectangle(shape, 0, 0, 100, 100);
    prepareScene2DRender(state, shape);
    const renderProxy = getOrCreateRenderProxy2D(state, shape);

    expect(() => drawWgpuScale9Shape(state, renderProxy)).not.toThrow();
    submitWgpuRenderPass(state);
  });
});

describe('drawWgpuScale9ShapeMask', () => {
  it('delegates to the Scale9 draw path', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    const shape = createScale9Shape(grid);
    prepareScene2DRender(state, shape);
    const renderProxy = getOrCreateRenderProxy2D(state, shape);

    expect(() => drawWgpuScale9ShapeMask(state, renderProxy)).not.toThrow();
    submitWgpuRenderPass(state);
  });
});

describe('getWgpuScale9ShapeData', () => {
  it('recovers the per-node Scale9 renderer data', () => {
    const rendererData = createWgpuScale9ShapeData({} as never, createScale9Shape(grid));

    expect(getWgpuScale9ShapeData(rendererData)?.surface).toBeNull();
  });
});
