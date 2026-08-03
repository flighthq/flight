import { getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import type { GlShapeRendererData } from '@flighthq/types/contract';

import {
  acquireGlShapeRasterSurface,
  createGlShapeData,
  destroyGlShapeData,
  getGlShapeData,
  toGlShapeRendererData,
} from './glShapeData';
import { createGlState } from './glTestHelper';

function emptyData(): GlShapeRendererData {
  return { surface: null, lastContentId: -1, lastPixelRatio: 0, lastW: 0, lastH: 0, meshVersion: -1, meshes: null };
}

describe('acquireGlShapeRasterSurface', () => {
  it('allocates once and returns the same surface thereafter', () => {
    const data = emptyData();
    const first = acquireGlShapeRasterSurface(data);
    expect(data.surface).toBe(first);
    expect(acquireGlShapeRasterSurface(data)).toBe(first);
  });

  it('wraps the canvas as an Image so the quad batch treats it like any other texture source', () => {
    const surface = acquireGlShapeRasterSurface(emptyData());
    expect(surface.image.source).toBe(surface.canvas);
  });
});

describe('createGlShapeData', () => {
  it('starts with neither cache populated, so a shape allocates nothing until a strategy needs it', () => {
    const { state } = createGlState();
    const data = getGlShapeData(createGlShapeData(state, {} as never)!);
    expect(data.surface).toBeNull();
    expect(data.meshes).toBeNull();
    expect(data.meshVersion).toBe(-1);
  });
});

describe('destroyGlShapeData', () => {
  it('does nothing when the shape only ever tessellated, since there is no surface to free', () => {
    const { state, gl } = createGlState();
    destroyGlShapeData(state, toGlShapeRendererData(emptyData()));
    expect(gl.deleteTexture).not.toHaveBeenCalled();
  });

  it('frees the cached GPU texture keyed on the raster surface', () => {
    const { state, gl } = createGlState();
    const data = emptyData();
    const surface = acquireGlShapeRasterSurface(data);
    const texture = {} as WebGLTexture;
    getGlRenderStateRuntime(state).textureSourcePremultipliedTextureCache.set(surface.image, { texture } as never);

    destroyGlShapeData(state, toGlShapeRendererData(data));

    expect(gl.deleteTexture).toHaveBeenCalledWith(texture);
    expect(getGlRenderStateRuntime(state).textureSourcePremultipliedTextureCache.has(surface.image)).toBe(false);
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
