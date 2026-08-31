import { createImageResource, invalidateImageResource } from '@flighthq/image/contract';
import { bindGlImageResourceTexture, getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import {
  getOrCreateRenderProxy2D,
  resetRaster2DSurfaceProviderForTest,
  setRaster2DSurfaceProvider,
} from '@flighthq/render/contract';
import { appendShapeBeginFill, appendShapeRectangle, createScale9Shape } from '@flighthq/shape/contract';
import type { Raster2DSurface } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import {
  acquireGlScale9ShapeRasterSurface,
  createGlScale9ShapeData,
  defaultGlScale9ShapeRenderer,
  destroyGlScale9ShapeData,
  drawGlScale9Shape,
  drawGlScale9ShapeMask,
  getGlScale9ShapeData,
} from './glScale9Shape';
import { createGlState } from './glTestHelper';

const grid = { height: 80, width: 80, x: 10, y: 10 };
const destroySurface = vi.fn();

function createTestSurface(width = 1, height = 1): Raster2DSurface {
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
}

beforeEach(() => {
  destroySurface.mockReset();
  setRaster2DSurfaceProvider({
    createRaster2DSurface: createTestSurface,
    destroyRaster2DSurface: destroySurface,
  });
});

afterEach(() => {
  resetRaster2DSurfaceProviderForTest();
});

describe('acquireGlScale9ShapeRasterSurface', () => {
  it('does not cache provider absence and retries on the next draw', () => {
    const surface = createTestSurface();
    const createSurface = vi.fn().mockReturnValueOnce(null).mockReturnValue(surface);
    setRaster2DSurfaceProvider({
      createRaster2DSurface: createSurface,
      destroyRaster2DSurface: destroySurface,
    });
    const { state } = createGlState();
    const data = getGlScale9ShapeData(createGlScale9ShapeData(state, createScale9Shape(grid))!);

    expect(acquireGlScale9ShapeRasterSurface(data)).toBeNull();
    expect(data.surface).toBeNull();
    expect(acquireGlScale9ShapeRasterSurface(data)).toBe(surface);
    expect(acquireGlScale9ShapeRasterSurface(data)).toBe(surface);
    expect(createSurface).toHaveBeenCalledTimes(2);
  });

  it('presents different textures for two nodes with different content in the same frame', () => {
    const { state } = createGlState();
    const firstData = getGlScale9ShapeData(createGlScale9ShapeData(state, createScale9Shape(grid))!);
    const secondData = getGlScale9ShapeData(createGlScale9ShapeData(state, createScale9Shape(grid))!);
    const first = acquireGlScale9ShapeRasterSurface(firstData)!;
    const second = acquireGlScale9ShapeRasterSurface(secondData)!;
    first.context.fillStyle = '#f00';
    first.context.fillRect(0, 0, 1, 1);
    second.context.fillStyle = '#00f';
    second.context.fillRect(0, 0, 1, 1);
    invalidateImageResource(first.image);
    invalidateImageResource(second.image);

    const firstTexture = bindGlImageResourceTexture(state, first.image, null, null, true);
    const secondTexture = bindGlImageResourceTexture(state, second.image, null, null, true);

    expect(first).not.toBe(second);
    expect(first.image).not.toBe(second.image);
    expect(firstTexture).not.toBe(secondTexture);
  });
});

describe('createGlScale9ShapeData', () => {
  it('leaves its per-node raster surface lazy', () => {
    const { state, gl } = createGlState();
    const data = getGlScale9ShapeData(createGlScale9ShapeData(state, createScale9Shape(grid))!);

    expect(data.surface).toBeNull();
    expect(gl.createTexture).not.toHaveBeenCalled();
  });
});

describe('defaultGlScale9ShapeRenderer', () => {
  it('wires createData, destroyData, and submit', () => {
    expect(defaultGlScale9ShapeRenderer.createData).toBe(createGlScale9ShapeData);
    expect(defaultGlScale9ShapeRenderer.destroyData).toBe(destroyGlScale9ShapeData);
    expect(defaultGlScale9ShapeRenderer.submit).toBe(drawGlScale9Shape);
  });
});

describe('destroyGlScale9ShapeData', () => {
  it('is a no-op when its lazy surface was never allocated', () => {
    const { state, gl } = createGlState();
    const data = createGlScale9ShapeData(state, createScale9Shape(grid))!;

    destroyGlScale9ShapeData(state, data);

    expect(gl.deleteTexture).not.toHaveBeenCalled();
    expect(destroySurface).not.toHaveBeenCalled();
  });

  it('removes its cached texture before destroying its per-node surface, idempotently', () => {
    const { state, gl } = createGlState();
    const data = createGlScale9ShapeData(state, createScale9Shape(grid))!;
    const surface = acquireGlScale9ShapeRasterSurface(getGlScale9ShapeData(data))!;
    const texture = {} as WebGLTexture;
    const cache = getGlRenderStateRuntime(state).context.textureSourcePremultipliedTextureCache;
    cache.set(surface.image, { texture } as never);
    const order: string[] = [];
    vi.mocked(gl.deleteTexture).mockImplementation(() => order.push('texture'));
    destroySurface.mockImplementation((destroyed) => {
      expect(cache.has(destroyed.image)).toBe(false);
      order.push('surface');
    });

    destroyGlScale9ShapeData(state, data);
    destroyGlScale9ShapeData(state, data);

    expect(gl.deleteTexture).toHaveBeenCalledOnce();
    expect(gl.deleteTexture).toHaveBeenCalledWith(texture);
    expect(cache.has(surface.image)).toBe(false);
    expect(destroySurface).toHaveBeenCalledOnce();
    expect(destroySurface).toHaveBeenCalledWith(surface);
    expect(order).toEqual(['texture', 'surface']);
  });

  it('destroys its raster surface even when it never acquired a GPU cache entry', () => {
    const { state } = createGlState();
    const data = createGlScale9ShapeData(state, createScale9Shape(grid))!;
    const surface = acquireGlScale9ShapeRasterSurface(getGlScale9ShapeData(data))!;

    destroyGlScale9ShapeData(state, data);

    expect(destroySurface).toHaveBeenCalledWith(surface);
  });
});

describe('drawGlScale9Shape', () => {
  it('returns early when commands are empty', () => {
    const { state, gl } = createGlState();
    const shape = createScale9Shape(grid);
    const data = getOrCreateRenderProxy2D(state, shape);

    drawGlScale9Shape(state, data);

    expect(gl.drawElements).not.toHaveBeenCalled();
  });

  it('returns early when rendererData is null', () => {
    const { state, gl } = createGlState();
    const shape = createScale9Shape(grid);
    appendShapeBeginFill(shape, 0xff0000ff);
    appendShapeRectangle(shape, 0, 0, 100, 100);
    const data = getOrCreateRenderProxy2D(state, shape);

    drawGlScale9Shape(state, data);

    expect(gl.drawElements).not.toHaveBeenCalled();
  });
});

describe('drawGlScale9ShapeMask', () => {
  it('uses the same draw path as normal Scale9 rendering', () => {
    const { state, gl } = createGlState();
    const shape = createScale9Shape(grid);
    const data = getOrCreateRenderProxy2D(state, shape);

    drawGlScale9ShapeMask(state, data);

    expect(gl.drawElements).not.toHaveBeenCalled();
  });
});

describe('getGlScale9ShapeData', () => {
  it('recovers the per-node Scale9 renderer data', () => {
    const { state } = createGlState();
    const rendererData = createGlScale9ShapeData(state, createScale9Shape(grid))!;

    expect(getGlScale9ShapeData(rendererData).surface).toBeNull();
    expect(EntityRuntimeKey in rendererData).toBe(true);
  });
});
