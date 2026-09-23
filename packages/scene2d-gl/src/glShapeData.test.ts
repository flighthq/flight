import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import {
  createImageResource,
  registerTestImageDimensionResolver,
  unregisterTestImageDimensionResolver,
} from '@flighthq/image/contract';
import { getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import type {
  CanvasSurface,
  GlShapeRendererData,
  HostCanvasCapability,
  HostImageCapability,
} from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import {
  acquireGlShapeRasterSurface,
  createGlShapeData,
  destroyGlShapeData,
  getGlShapeData,
  initializeGlShapeData,
  toGlShapeRendererData,
} from './glShapeData';
import { createGlState } from './glTestHelper';

// A test that wraps a host handle supplies the host: the resource measures through the registered
// resolver, and clearing after each test keeps this file from covering for another's missing one.
beforeEach(() => {
  registerTestImageDimensionResolver();
});

afterEach(() => {
  unregisterTestImageDimensionResolver();
});

const destroySurface = vi.fn();

function emptyData(): GlShapeRendererData {
  const out = allocateEntity<GlShapeRendererData>();
  out.image = null;
  out.lastContentId = -1;
  out.lastH = 0;
  out.lastPixelRatio = 0;
  out.lastW = 0;
  out.meshVersion = -1;
  out.meshes = null;
  out.surface = null;
  return finishEntity(out);
}

beforeEach(() => {
  destroySurface.mockReset();
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

describe('acquireGlShapeRasterSurface', () => {
  it('allocates once and returns the same surface thereafter', () => {
    const canvasHost = createTestCanvasHost();
    const imageHost = createTestImageHost();
    const data = emptyData();
    const first = acquireGlShapeRasterSurface(canvasHost, imageHost, data);
    expect(data.surface).toBe(first);
    expect(acquireGlShapeRasterSurface(canvasHost, imageHost, data)).toBe(first);
  });

  it('wraps the canvas as an Image so the quad batch treats it like any other texture source', () => {
    const data = emptyData();
    const surface = acquireGlShapeRasterSurface(createTestCanvasHost(), createTestImageHost(), data)!;
    expect(data.image!.source).toBe(surface.context.canvas);
    expect('canvas' in surface).toBe(false);
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
    expect(acquireGlShapeRasterSurface(canvasHost, imageHost, data)).toBeNull();
    expect(data.surface).toBeNull();
  });
});

describe('createGlShapeData', () => {
  it('starts with neither cache populated, so a shape allocates nothing until a strategy needs it', () => {
    const { state } = createGlState();
    const data = getGlShapeData(createGlShapeData(state, {} as never)!);
    expect(data.surface).toBeNull();
    expect(data.meshes).toBeNull();
    expect(data.meshVersion).toBe(-1);
    expect(EntityRuntimeKey in data).toBe(true);
  });
});

describe('destroyGlShapeData', () => {
  it('does nothing when the shape only ever tessellated, since there is no surface to free', () => {
    const { state, gl } = createGlState();
    destroyGlShapeData(state, toGlShapeRendererData(emptyData()));
    expect(gl.deleteTexture).not.toHaveBeenCalled();
    expect(destroySurface).not.toHaveBeenCalled();
  });

  it('frees the cached GPU texture before destroying the raster surface', () => {
    const { state, gl } = createGlState();
    const data = emptyData();
    const canvasHost = createTestCanvasHost();
    const imageHost = createTestImageHost();
    const surface = acquireGlShapeRasterSurface(canvasHost, imageHost, data)!;
    const image = data.image!;
    const texture = {} as WebGLTexture;
    const cache = getGlRenderStateRuntime(state).context.textureSourcePremultipliedTextureCache;
    cache.set(image, { texture } as never);
    const order: string[] = [];
    vi.mocked(gl.deleteTexture).mockImplementation(() => order.push('texture'));
    destroySurface.mockImplementation(() => {
      expect(cache.has(image)).toBe(false);
      order.push('surface');
    });

    destroyGlShapeData(state, toGlShapeRendererData(data));

    expect(gl.deleteTexture).toHaveBeenCalledWith(texture);
    expect(cache.has(image)).toBe(false);
    expect(destroySurface).toHaveBeenCalledWith(surface);
    expect(order).toEqual(['texture', 'surface']);
  });

  it('destroys a raster surface even when it never acquired a GPU cache entry', () => {
    const { state } = createGlState();
    const data = emptyData();
    const canvasHost = createTestCanvasHost();
    const imageHost = createTestImageHost();
    const surface = acquireGlShapeRasterSurface(canvasHost, imageHost, data)!;

    destroyGlShapeData(state, toGlShapeRendererData(data));

    expect(destroySurface).toHaveBeenCalledWith(surface);
  });
});

describe('getGlShapeData', () => {
  it('round-trips through the opaque RendererData slot', () => {
    const data = emptyData();
    expect(getGlShapeData(toGlShapeRendererData(data))).toBe(data);
  });
});

describe('initializeGlShapeData', () => {
  it('is the construction initializer of createGlShapeData', () => {
    expect(typeof initializeGlShapeData).toBe('function');
  });
});
describe('toGlShapeRendererData', () => {
  it('is the inverse of getGlShapeData', () => {
    const data = emptyData();
    expect(toGlShapeRendererData(getGlShapeData(toGlShapeRendererData(data)))).toBe(toGlShapeRendererData(data));
  });
});
