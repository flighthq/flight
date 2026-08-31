import { createImageResource } from '@flighthq/image/contract';
import { getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import { resetRaster2DSurfaceProviderForTest, setRaster2DSurfaceProvider } from '@flighthq/render/contract';
import { createTextLabel, setTextLabelString } from '@flighthq/text/contract';
import * as textlayout from '@flighthq/textlayout/contract';
import type { Raster2DSurface, RendererData, RenderProxy2D, TextLabel } from '@flighthq/types/contract';
import { BatchFormat, EntityRuntimeKey } from '@flighthq/types/contract';

import { flushGlQuadBatchWriter } from './glQuadBatchWriter';
import { registerGlStandardMaterial } from './glStandardMaterial';
import { createGlState } from './glTestHelper';
import { defaultGlTextLabelRenderer, drawGlTextLabel } from './glTextLabel';

// @flighthq/textlayout.computeTextLayout is stubbed to emit one deterministic glyph group.
beforeEach(() => {
  vi.spyOn(textlayout, 'computeTextLayout').mockImplementation(((
    result: { groups: object[] },
    params: { formatRanges: Array<{ format: object }> },
  ) => {
    result.groups.push({
      offsetX: 0,
      offsetY: 0,
      width: 50,
      ascent: 12,
      descent: 4,
      format: params.formatRanges[0]?.format ?? {},
      startIndex: 0,
      endIndex: 5,
    });
  }) as never);
});

afterEach(() => {
  vi.restoreAllMocks();
  resetRaster2DSurfaceProviderForTest();
});

function createTestRaster2DSurface(width: number, height: number): Raster2DSurface {
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

function makeTextData() {
  return {
    surface: createTestRaster2DSurface(1, 1),
    lastContentId: -1,
    lastPixelRatio: 0,
    logW: 0,
    logH: 0,
  };
}

function makeTextProxy(text = '', rendererData: unknown = null): RenderProxy2D {
  const source = createTextLabel();
  source.data.text = text;
  source.data.textFormat = {};
  source.data.width = 200;
  source.data.height = 100;
  return {
    source,
    blendMode: 0,
    alpha: 1,
    material: null,
    materialData: null,
    transform2D: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
    rendererData,
  } as unknown as RenderProxy2D;
}

function installTestRaster2DSurfaceProvider(
  destroyRaster2DSurface: (surface: Raster2DSurface) => void = () => {},
): void {
  setRaster2DSurfaceProvider({
    createRaster2DSurface(width, height) {
      return createTestRaster2DSurface(width, height);
    },
    destroyRaster2DSurface,
  });
}

describe('defaultGlTextLabelRenderer', () => {
  it('declares BatchFormat.Quad', () => {
    expect(defaultGlTextLabelRenderer.format).toBe(BatchFormat.Quad);
  });

  it('has a createData function', () => {
    expect(typeof defaultGlTextLabelRenderer.createData).toBe('function');
  });

  it('creates RendererData with an entity runtime slot', () => {
    const data = defaultGlTextLabelRenderer.createData!(createGlState().state, createTextLabel())!;
    expect(EntityRuntimeKey in data).toBe(true);
  });

  it('has a submit function pointing to drawGlTextLabel', () => {
    expect(defaultGlTextLabelRenderer.submit).toBe(drawGlTextLabel);
  });

  it('removes the GPU cache entry before returning the node surface to its creator', () => {
    const order: string[] = [];
    const { state, gl } = createGlState();
    const cache = getGlRenderStateRuntime(state).context.textureSourcePremultipliedTextureCache;
    installTestRaster2DSurfaceProvider((surface) => {
      order.push('surface');
      expect(cache.has(surface.image)).toBe(false);
    });
    registerGlStandardMaterial(state);
    const data = defaultGlTextLabelRenderer.createData!(state, createTextLabel())!;
    drawGlTextLabel(state, makeTextProxy('owned', data));
    const surface = (data as RendererData & { surface: Raster2DSurface }).surface;
    const entry = cache.get(surface.image)!;
    vi.spyOn(gl, 'deleteTexture').mockImplementation((texture) => {
      if (texture === entry.texture) order.push('texture');
    });

    defaultGlTextLabelRenderer.destroyData!(state, data);

    expect(cache.has(surface.image)).toBe(false);
    expect(order).toEqual(['texture', 'surface']);
  });
});

describe('drawGlTextLabel', () => {
  it('keeps different text nodes on distinct surfaces and GPU textures in one frame', () => {
    installTestRaster2DSurfaceProvider();
    const { state } = createGlState();
    registerGlStandardMaterial(state);
    const firstData = defaultGlTextLabelRenderer.createData!(state, createTextLabel())!;
    const secondData = defaultGlTextLabelRenderer.createData!(state, createTextLabel())!;

    drawGlTextLabel(state, makeTextProxy('first', firstData));
    drawGlTextLabel(state, makeTextProxy('second', secondData));

    const firstSurface = (firstData as unknown as { surface: Raster2DSurface }).surface;
    const secondSurface = (secondData as unknown as { surface: Raster2DSurface }).surface;
    const cache = getGlRenderStateRuntime(state).context.textureSourcePremultipliedTextureCache;
    const firstImage = firstSurface.image;
    expect(firstSurface).not.toBe(secondSurface);
    expect(firstSurface.image).not.toBe(secondSurface.image);
    expect(cache.get(firstSurface.image)?.texture).not.toBe(cache.get(secondSurface.image)?.texture);

    drawGlTextLabel(state, makeTextProxy('first', firstData));
    expect((firstData as unknown as { surface: Raster2DSurface }).surface).toBe(firstSurface);
    expect(firstSurface.image).toBe(firstImage);
  });

  it('returns early without writing to batch when text is empty', () => {
    const { state } = createGlState();
    registerGlStandardMaterial(state);
    drawGlTextLabel(state, makeTextProxy('', makeTextData()));
    expect(getGlRenderStateRuntime(state).quadBatchWriterCount).toBe(0);
  });

  it('returns early without writing to batch when rendererData is null', () => {
    const { state } = createGlState();
    registerGlStandardMaterial(state);
    drawGlTextLabel(state, makeTextProxy('hello', null));
    expect(getGlRenderStateRuntime(state).quadBatchWriterCount).toBe(0);
  });

  it('returns early without writing to batch when no material renderer is registered', () => {
    const { state } = createGlState();
    drawGlTextLabel(state, makeTextProxy('hello', makeTextData()));
    expect(getGlRenderStateRuntime(state).quadBatchWriterCount).toBe(0);
  });

  it('writes one instance to the quad-batch writer when text has content', () => {
    const { state } = createGlState();
    registerGlStandardMaterial(state);
    drawGlTextLabel(state, makeTextProxy('hello', makeTextData()));
    expect(getGlRenderStateRuntime(state).quadBatchWriterCount).toBe(1);
  });

  it('rasterizes packed run alpha into the canvas color', () => {
    const { state } = createGlState();
    registerGlStandardMaterial(state);
    const data = makeTextData();
    const proxy = makeTextProxy('hello', data);
    (proxy.source as TextLabel).data.textFormat = { color: 0xff000080 };
    const styles: Array<string | CanvasGradient | CanvasPattern> = [];
    vi.spyOn(data.surface.context, 'fillText').mockImplementation(() => styles.push(data.surface.context.fillStyle));

    drawGlTextLabel(state, proxy);

    expect(styles).toEqual(['rgba(255, 0, 0, 0.5019607843137255)']);
  });

  it('draws via drawElementsInstanced after flush', () => {
    const { state, gl } = createGlState();
    registerGlStandardMaterial(state);
    drawGlTextLabel(state, makeTextProxy('hello', makeTextData()));
    flushGlQuadBatchWriter(state);
    expect(gl.drawElementsInstanced).toHaveBeenCalled();
  });

  it('skips layout and rasterization on repeated calls when the content version is unchanged', () => {
    const { state } = createGlState();
    registerGlStandardMaterial(state);
    const data = makeTextData();
    const proxy = makeTextProxy('hello', data);
    drawGlTextLabel(state, proxy);
    // Rasterization bumps the canvas resource's version (invalidateImageResource); a skipped raster leaves
    // it untouched. First draw rasterizes (version → 1); the repeat is skipped.
    const rasterized = data.surface.image.version;
    drawGlTextLabel(state, proxy);
    expect(data.surface.image.version).toBe(rasterized);
  });

  it('re-rasterizes when the content version is bumped', () => {
    const { state } = createGlState();
    registerGlStandardMaterial(state);
    const data = makeTextData();
    const proxy = makeTextProxy('hello', data);
    drawGlTextLabel(state, proxy);
    const rasterized = data.surface.image.version;
    setTextLabelString(proxy.source as TextLabel, 'world');
    drawGlTextLabel(state, proxy);
    expect(data.surface.image.version).toBeGreaterThan(rasterized);
  });

  it('does not re-rasterize when only alpha changes (version unchanged)', () => {
    const { state } = createGlState();
    registerGlStandardMaterial(state);
    const data = makeTextData();
    const proxy = makeTextProxy('hello', data);
    drawGlTextLabel(state, proxy);
    const rasterized = data.surface.image.version;
    proxy.alpha = 0.5;
    drawGlTextLabel(state, proxy);
    // Alpha is applied per-instance in the batch; the expensive raster (and its version bump) is untouched.
    expect(data.surface.image.version).toBe(rasterized);
  });
});
