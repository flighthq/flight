import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { createImageResource } from '@flighthq/image/contract';
import { getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import type { GlShapeRendererData, Raster2DSurface, Raster2DSurfaceProvider } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import {
  acquireGlShapeRasterSurface,
  createGlShapeData,
  destroyGlShapeData,
  getGlShapeData,
  toGlShapeRendererData,
} from './glShapeData';
import { createGlState } from './glTestHelper';

const destroySurface = vi.fn();

function emptyData(): GlShapeRendererData {
  const out = allocateEntity<GlShapeRendererData>();
  out.surface = null;
  out.lastContentId = -1;
  out.lastPixelRatio = 0;
  out.lastW = 0;
  out.lastH = 0;
  out.meshVersion = -1;
  out.meshes = null;
  return finishEntity(out);
}

beforeEach(() => {
  destroySurface.mockReset();
});

function createTestRaster2DSurface(width: number, height: number): Raster2DSurface {
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

function createTestProvider(): Raster2DSurfaceProvider {
  const out = allocateEntity<GlShapeRendererData>();
  out.createRaster2DSurface = createTestRaster2DSurface;
  out.destroyRaster2DSurface = destroySurface;
  return finishEntity(out);
}

function setTestRasterProvider(state: { raster2DSurfaceProvider: unknown }): void {
  state.raster2DSurfaceProvider = createTestProvider();
}

describe('acquireGlShapeRasterSurface', () => {
  it('allocates once and returns the same surface thereafter', () => {
    const provider = createTestProvider();
    const data = emptyData();
    const first = acquireGlShapeRasterSurface(provider, data);
    expect(data.surface).toBe(first);
    expect(acquireGlShapeRasterSurface(provider, data)).toBe(first);
  });

  it('wraps the canvas as an Image so the quad batch treats it like any other texture source', () => {
    const surface = acquireGlShapeRasterSurface(createTestProvider(), emptyData())!;
    expect(surface.image.source).toBe(surface.context.canvas);
    expect('canvas' in surface).toBe(false);
  });

  it('preserves expected absence without caching it when the provider refuses', () => {
    const provider = allocateEntity<GlShapeRendererData>();
    provider.createRaster2DSurface = () => null;
    provider.destroyRaster2DSurface = destroySurface;
    const data = emptyData();
    expect(acquireGlShapeRasterSurface(provider, data)).toBeNull();
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
    const surface = acquireGlShapeRasterSurface(createTestProvider(), data)!;
    const texture = {} as WebGLTexture;
    const cache = getGlRenderStateRuntime(state).context.textureSourcePremultipliedTextureCache;
    cache.set(surface.image, { texture } as never);
    const order: string[] = [];
    vi.mocked(gl.deleteTexture).mockImplementation(() => order.push('texture'));
    destroySurface.mockImplementation((destroyed) => {
      expect(cache.has(destroyed.image)).toBe(false);
      order.push('surface');
    });

    destroyGlShapeData(state, toGlShapeRendererData(data));

    expect(gl.deleteTexture).toHaveBeenCalledWith(texture);
    expect(cache.has(surface.image)).toBe(false);
    expect(destroySurface).toHaveBeenCalledWith(surface);
    expect(order).toEqual(['texture', 'surface']);
  });

  it('destroys a raster surface even when it never acquired a GPU cache entry', () => {
    const { state } = createGlState();
    const data = emptyData();
    const surface = acquireGlShapeRasterSurface(createTestProvider(), data)!;

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

describe('toGlShapeRendererData', () => {
  it('is the inverse of getGlShapeData', () => {
    const data = emptyData();
    expect(toGlShapeRendererData(getGlShapeData(toGlShapeRendererData(data)))).toBe(toGlShapeRendererData(data));
  });
});
