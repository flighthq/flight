import {
  createImageResource,
  invalidateImageResource,
  registerTestImageDimensionResolver,
  unregisterTestImageDimensionResolver,
} from '@flighthq/image/contract';
import { bindGlImageResourceTexture, getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import { getOrCreateRenderProxy2D } from '@flighthq/render/contract';
import { appendShapeBeginFill, appendShapeRectangle, createScale9Shape } from '@flighthq/shape/contract';
import type { CanvasSurface, HostCanvasCapability, HostImageCapability } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import {
  acquireGlScale9ShapeRasterSurface,
  createGlScale9ShapeData,
  glScale9ShapeRenderer,
  destroyGlScale9ShapeData,
  drawGlScale9Shape,
  drawGlScale9ShapeMask,
  getGlScale9ShapeData,
  initializeGlScale9ShapeData,
} from './glScale9Shape.ts';
import { createGlState } from './glTestHelper.ts';

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

function createTestSurface(width = 1, height = 1): CanvasSurface {
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

beforeEach(() => {
  destroySurface.mockReset();
});

function setTestHosts(state: { canvasHost: unknown; imageHost: unknown }): void {
  state.canvasHost = createTestCanvasHost();
  state.imageHost = createTestImageHost();
}

describe('acquireGlScale9ShapeRasterSurface', () => {
  it('does not cache provider absence and retries on the next draw', () => {
    const surface = createTestSurface();
    const createSurfaceMock = vi.fn().mockReturnValueOnce(null).mockReturnValue(surface);
    const { state } = createGlState();
    const canvasHost: HostCanvasCapability = {
      acquire: () => null,
      create: () => null,
      createSurface: createSurfaceMock,
      destroySurface,
      release() {},
    };
    const imageHost = createTestImageHost();
    const data = getGlScale9ShapeData(createGlScale9ShapeData(state, createScale9Shape(grid))!);

    expect(acquireGlScale9ShapeRasterSurface(canvasHost, imageHost, data)).toBeNull();
    expect(data.surface).toBeNull();
    expect(acquireGlScale9ShapeRasterSurface(canvasHost, imageHost, data)).toBe(surface);
    expect(acquireGlScale9ShapeRasterSurface(canvasHost, imageHost, data)).toBe(surface);
    expect(createSurfaceMock).toHaveBeenCalledTimes(2);
  });

  it('presents different textures for two nodes with different content in the same frame', () => {
    const { state } = createGlState();
    setTestHosts(state);
    const canvasHost = state.canvasHost!;
    const imageHost = state.imageHost!;
    const firstData = getGlScale9ShapeData(createGlScale9ShapeData(state, createScale9Shape(grid))!);
    const secondData = getGlScale9ShapeData(createGlScale9ShapeData(state, createScale9Shape(grid))!);
    const first = acquireGlScale9ShapeRasterSurface(canvasHost, imageHost, firstData)!;
    const second = acquireGlScale9ShapeRasterSurface(canvasHost, imageHost, secondData)!;
    first.context.fillStyle = '#f00';
    first.context.fillRect(0, 0, 1, 1);
    second.context.fillStyle = '#00f';
    second.context.fillRect(0, 0, 1, 1);
    const firstImage = firstData.image!;
    const secondImage = secondData.image!;
    invalidateImageResource(firstImage);
    invalidateImageResource(secondImage);

    const firstTexture = bindGlImageResourceTexture(state, firstImage, null, null, true);
    const secondTexture = bindGlImageResourceTexture(state, secondImage, null, null, true);

    expect(first).not.toBe(second);
    expect(firstImage).not.toBe(secondImage);
    expect(firstTexture).not.toBe(secondTexture);
  });
});

describe('createGlScale9ShapeData', () => {
  it('leaves its per-node raster surface lazy', () => {
    const { state, gl } = createGlState();
    setTestHosts(state);
    const data = getGlScale9ShapeData(createGlScale9ShapeData(state, createScale9Shape(grid))!);

    expect(data.surface).toBeNull();
    expect(gl.createTexture).not.toHaveBeenCalled();
  });
});

describe('destroyGlScale9ShapeData', () => {
  it('is a no-op when its lazy surface was never allocated', () => {
    const { state, gl } = createGlState();
    setTestHosts(state);
    const data = createGlScale9ShapeData(state, createScale9Shape(grid))!;

    destroyGlScale9ShapeData(state, data);

    expect(gl.deleteTexture).not.toHaveBeenCalled();
    expect(destroySurface).not.toHaveBeenCalled();
  });

  it('removes its cached texture before destroying its per-node surface, idempotently', () => {
    const { state, gl } = createGlState();
    setTestHosts(state);
    const data = createGlScale9ShapeData(state, createScale9Shape(grid))!;
    const shapeData = getGlScale9ShapeData(data);
    const surface = acquireGlScale9ShapeRasterSurface(state.canvasHost!, state.imageHost!, shapeData)!;
    const image = shapeData.image!;
    const texture = {} as WebGLTexture;
    const cache = getGlRenderStateRuntime(state).context.textureSourcePremultipliedTextureCache;
    cache.set(image, { texture } as never);
    const order: string[] = [];
    vi.mocked(gl.deleteTexture).mockImplementation(() => order.push('texture'));
    destroySurface.mockImplementation(() => {
      expect(cache.has(image)).toBe(false);
      order.push('surface');
    });

    destroyGlScale9ShapeData(state, data);
    destroyGlScale9ShapeData(state, data);

    expect(gl.deleteTexture).toHaveBeenCalledOnce();
    expect(gl.deleteTexture).toHaveBeenCalledWith(texture);
    expect(cache.has(image)).toBe(false);
    expect(destroySurface).toHaveBeenCalledOnce();
    expect(destroySurface).toHaveBeenCalledWith(surface);
    expect(order).toEqual(['texture', 'surface']);
  });

  it('destroys its raster surface even when it never acquired a GPU cache entry', () => {
    const { state } = createGlState();
    setTestHosts(state);
    const data = createGlScale9ShapeData(state, createScale9Shape(grid))!;
    const surface = acquireGlScale9ShapeRasterSurface(state.canvasHost!, state.imageHost!, getGlScale9ShapeData(data))!;

    destroyGlScale9ShapeData(state, data);

    expect(destroySurface).toHaveBeenCalledWith(surface);
  });
});

describe('drawGlScale9Shape', () => {
  it('returns early when commands are empty', () => {
    const { state, gl } = createGlState();
    setTestHosts(state);
    const shape = createScale9Shape(grid);
    const data = getOrCreateRenderProxy2D(state, shape);

    drawGlScale9Shape(state, data);

    expect(gl.drawElements).not.toHaveBeenCalled();
  });

  it('returns early when rendererData is null', () => {
    const { state, gl } = createGlState();
    setTestHosts(state);
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
    setTestHosts(state);
    const shape = createScale9Shape(grid);
    const data = getOrCreateRenderProxy2D(state, shape);

    drawGlScale9ShapeMask(state, data);

    expect(gl.drawElements).not.toHaveBeenCalled();
  });
});

describe('getGlScale9ShapeData', () => {
  it('recovers the per-node Scale9 renderer data', () => {
    const { state } = createGlState();
    setTestHosts(state);
    const rendererData = createGlScale9ShapeData(state, createScale9Shape(grid))!;

    expect(getGlScale9ShapeData(rendererData).surface).toBeNull();
    expect(EntityRuntimeKey in rendererData).toBe(true);
  });
});

describe('glScale9ShapeRenderer', () => {
  it('wires createData, destroyData, and submit', () => {
    expect(glScale9ShapeRenderer.createData).toBe(createGlScale9ShapeData);
    expect(glScale9ShapeRenderer.destroyData).toBe(destroyGlScale9ShapeData);
    expect(glScale9ShapeRenderer.submit).toBe(drawGlScale9Shape);
  });
});
describe('initializeGlScale9ShapeData', () => {
  it('is the construction initializer of createGlScale9ShapeData', () => {
    expect(typeof initializeGlScale9ShapeData).toBe('function');
  });
});
